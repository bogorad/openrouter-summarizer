#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status.
set -e
set -o pipefail

# --- Dependency Checks ---
command -v repomix >/dev/null 2>&1 || { echo >&2 "Error: 'repomix' is not installed. Aborting."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo >&2 "Error: 'curl' is not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo >&2 "Error: 'jq' is not installed. Aborting."; exit 1; }

#############################################################
# --- Environment Variable Handling ---
echo "Info: Checking API key sources..." >&2

# Check secret file first
if [[ -f "/run/secrets/api_keys/openrouter" ]]; then
  OPENROUTER_API_KEY=$(tr -d '[:space:]' < "/run/secrets/api_keys/openrouter")
  export OPENROUTER_API_KEY
  echo "Info: Loaded API key from secret file" >&2
fi

# Check .env file
if [[ -f ".env" ]]; then
  # Read lines that are not comments and contain '='
  while IFS='=' read -r key value; do
    # Skip empty keys
    [[ -z "$key" ]] && continue
    
    # Normalize key - trim whitespace and remove any potential comment suffix
    key=$(echo "$key" | awk '{$1=$1};1')
    
    # Skip if key starts with # (comment)
    [[ "$key" =~ ^# ]] && continue
    
    # Remove leading/trailing whitespace and quotes from the value
    value_trimmed=$(echo "$value" | awk '{$1=$1};1' | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//')
    
    # Only export if the variable is not already set from the environment
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value_trimmed"
      echo "Info: Loaded $key from .env" >&2
    fi
  done < <(grep -v '^\s*#' .env | grep '=')
fi

# Set defaults and validate
CODE_AUDITOR_MODEL="${CODE_AUDITOR_MODEL:-qwen/qwen3-235b-a22b-thinking-2507}"
if [[ -z "$OPENROUTER_API_KEY" ]]; then
  echo >&2 "Error: OPENROUTER_API_KEY is not set. Check:" >&2
  echo >&2 "  1. Environment variable" >&2
  echo >&2 "  2. Secret file at /run/secrets/api_keys/openrouter" >&2
  echo >&2 "  3. .env file with OPENROUTER_API_KEY" >&2
  exit 1
fi

#############################################################
# --- Model Validation
echo "Info: Testing model '$CODE_AUDITOR_MODEL'..." >&2

# Create temporary files for response handling
ping_response_file=$(mktemp) || exit 1
trap 'rm -f "$ping_response_file"' EXIT

# Build request with provider priority and metadata headers
PING_REQUEST_JSON=$(jq -nc \
  --arg model "$CODE_AUDITOR_MODEL" \
  '{
    "model": $model,
    "max_tokens": 1,
    "messages": [{"role":"user","content":"ping"}],
    "provider": {
      "order": ["chutes", "deepinfra/fp8"]
    }
  }')

# Simplified curl status handling - write body to file and capture status code directly
HTTP_STATUS=$(curl -sS -o "$ping_response_file" -w "%{http_code}" \
  -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://bogorad.github.io/" \
  -H "X-Title: AuditCode" \
  -H "Content-Type: application/json" \
  -d "$PING_REQUEST_JSON")

# Check for success (200 status)
if [ "$HTTP_STATUS" != "200" ]; then
  echo >&2 "Error: Model validation failed (HTTP $HTTP_STATUS)"
  if [ -s "$ping_response_file" ]; then
    echo "Response details:" >&2
    if jq empty "$ping_response_file" 2>/dev/null; then
      jq . >&2 "$ping_response_file"
    else
      cat "$ping_response_file" >&2
    fi
  else
    echo "No response body received" >&2
  fi
  exit 1
fi
echo "Info: Model '$CODE_AUDITOR_MODEL' validated successfully" >&2
#############################################################

# --- Define System Prompt ---
PROMPT_CONTENT=$(cat <<'EOF'
You are a world-class senior staff software engineer and cybersecurity expert
specializing in multiple programming languages and technology stacks. Your task
is to perform a holistic audit of the following software application codebase,
which has been packed into a single context for you.

Your analysis must be thorough, deep, and actionable.

**Severity Rubric**  
- **[Critical]**: Immediate breach/RCE risk (e.g., SQLi in auth flow).  
- **[High]**: Data leakage/privilege escalation (e.g., IDOR in order history).  
- **[Medium]**: Functional failure (e.g., race condition causing payment dupe).  
- **[Low]**: Low-risk (e.g., unused import).  

**Audit Focus**

1. **Security Vulnerabilities:** Scrutinize for any potential security flaws, such as SQL injection, cross-site scripting (XSS), insecure authentication, or improper access controls.
2. **Architectural Issues:** Evaluate the overall design, looking for tight coupling, poor separation of concerns, scalability bottlenecks, or violations of design principles like SOLID, DRY, dead code, and defensive programming.
3. **Bugs and Logic Errors:** Identify potential bugs, race conditions, or flawed logic that could lead to incorrect behavior, crashes, or unexpected failures.
4. **Code Quality and Maintainability:** Look for violations of best practices, "code smells," or areas where the code is difficult to read, maintain, or extend.

Prioritize the most critical issues first, focusing on high-impact areas such as security vulnerabilities and architectural flaws.

Your final output MUST be a well-structured Markdown document. For each issue you identify, you MUST provide the following:

- A clear and descriptive title for the issue.
- A severity rating: [Critical], [High], [Medium], or [Low].
- A detailed paragraph explaining the problem and the risk it poses.
- The exact file path and line number(s) where the issue can be found.
- A specific, actionable code example demonstrating how to fix it.

For example, an issue might be described as follows:

**Issue Title**: SQL Injection Vulnerability
**Severity**: [Critical]
**Description**: The code uses string concatenation to build SQL queries, which can lead to SQL injection attacks. This poses a significant security risk as it allows attackers to execute arbitrary SQL commands.
**Location**: /path/to/file.php, lines 45-50
**Fix**: Use prepared statements to prevent SQL injection. Here is an example:

```php
$stmt = $pdo->prepare('SELECT * FROM users WHERE username = :username');
$stmt->execute(['username' => $username]);
```

Your response should be professional, concise, and focused on providing actionable insights. Avoid unnecessary explanations or tangents. Do not begin your response with any pleasantries. Start directly with the first issue.

Here is the codebase:
EOF
)

#############################################################
# MAIN EXECUTION
#############################################################

# Create temporary files with proper cleanup
codebase_file=$(mktemp) || exit 1
payload_file=$(mktemp) || { rm -f "$codebase_file"; exit 1; }
response_file=$(mktemp) || { rm -f "$codebase_file" "$payload_file"; exit 1; }
trap 'rm -f "$codebase_file" "$payload_file" "$response_file"' EXIT

# Run repomix to collect codebase
echo "Info: Running repomix to collect codebase..." >&2
if ! repomix --stdout "$@" > "$codebase_file"; then
  echo >&2 "Error: repomix failed to generate codebase content"
  exit 1
fi

# FIX #1: Use jq to build payload correctly (no manual escaping)
# This properly handles all JSON escaping automatically
echo "Info: Constructing JSON payload safely with jq..." >&2
if ! jq -nc \
  --arg model "$CODE_AUDITOR_MODEL" \
  --arg prompt "$PROMPT_CONTENT" \
  --rawfile codebase "$codebase_file" \
  '{
    "model": $model,
    "provider": {
      "order": ["chutes", "deepinfra/fp8"]
    },
    "messages": [
      {
        "role": "system",
        "content": $prompt
      },
      {
        "role": "user",
        "content": $codebase
      }
    ]
  }' > "$payload_file"; then
  echo >&2 "Error: Failed to generate request payload with jq"
  exit 1
fi

# Send main request using simplified curl status handling (FIX #2)
echo "Info: Sending request to OpenRouter with provider priority..." >&2
HTTP_STATUS=$(curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "HTTP-Referer: https://bogorad.github.io/" \
  -H "X-Title: AuditCode" \
  -H "Content-Type: application/json" \
  -d "@$payload_file")

# Handle API response
if [ "$HTTP_STATUS" != "200" ]; then
  echo >&2 "Error: API request failed (HTTP $HTTP_STATUS)"
  if [ -s "$response_file" ]; then
    echo "API Response:" >&2
    if jq empty "$response_file" 2>/dev/null; then
      jq . >&2 "$response_file"
    else
      cat "$response_file" >&2
    fi
  fi
  exit 1
fi

# Output ONLY model content to stdout (all else is stderr)
echo "Info: Extracting model response..." >&2
jq -r '.choices[0].message.content' "$response_file"

# Done notification (stderr)
echo >&2
echo "---" >&2
echo "Info: Processing complete (referenced in OR logs as 'AuditCode')" >&2

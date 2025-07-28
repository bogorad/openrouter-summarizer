#!/usr/bin/env bash

# A script to run repomix with arguments, use an inline prompt for system instructions,
# format the output for the OpenRouter API, and send it for analysis, all via pipes.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"

# --- Dependency Checks ---
command -v repomix >/dev/null 2>&1 || { echo >&2 "Error: 'repomix' is not installed. Aborting."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo >&2 "Error: 'curl' is not installed. Aborting."; exit 1; }
command -v awk >/dev/null 2>&1 || { echo >&2 "Error: 'awk' is not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo >&2 "Error: 'jq' is not installed. Aborting."; exit 1; }

# --- Environment Variable Handling ---
# Source .env file if it exists.
# if [[ -f "./.env" ]]; then
#   echo "Info: Sourcing variables from ./.env file." >&2
#   # The `|| true` prevents `set -e` from exiting if grep finds no lines.
#   # We capture the output and only run export if there is something to export.
#   vars_to_export=$(grep -E '^(OPENROUTER_API_KEY|CODE_AUDITOR_MODEL)=' ./.env | grep -v '^#' || true)
#   if [[ -n "$vars_to_export" ]]; then
#       export $(echo "$vars_to_export" | xargs)
#   fi
# fi
if [[ -f ".env" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^# ]] && continue  # Skip comments
    case "$key" in
      OPENROUTER_API_KEY|CODE_AUDITOR_MODEL)
        # Strip surrounding quotes if present
        value="${value%\"}"
        value="${value#\"}"
        value="${value%'}"
        value="${value#'}"
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^(OPENROUTER_API_KEY|CODE_AUDITOR_MODEL)=' .env)
fi

# Set the default model ONLY if it's still not set (from either the environment or the .env file).
CODE_AUDITOR_MODEL="${CODE_AUDITOR_MODEL:-qwen/qwen3-235b-a22b-2507:free}"

# Final check for the mandatory API key.
if [[ -z "$OPENROUTER_API_KEY" ]]; then
  echo >&2 "Error: OPENROUTER_API_KEY is not set."
  echo >&2 "Please set it in your environment or in a ./.env file."
  exit 1
fi

echo "Info: API Key loaded. Using model: $CODE_AUDITOR_MODEL" >&2

# --- Step 1: Define inline prompt ---
# Use command substitution with a here document for a robust, multi-line string assignment.
# The quoted 'EOF' prevents shell expansion inside the block.
PROMPT_CONTENT=$(cat <<'EOF'
You are a world-class senior staff software engineer and cybersecurity expert specializing in [insert programming language or technology stack, e.g., Python, Java, web applications, etc.]. Your task is to perform a holistic audit of the following [insert type of application, e.g., web application, API, microservice, etc.] codebase, which has been packed into a single context for you.

Your analysis must be thorough, deep, and actionable. Review the entire system for the following key areas:

1. **Security Vulnerabilities:** Scrutinize for any potential security flaws, such as SQL injection, cross-site scripting (XSS), insecure authentication, or improper access controls.
2. **Architectural Issues:** Evaluate the overall design, looking for tight coupling, poor separation of concerns, scalability bottlenecks, or violations of design principles like SOLID, DRY, and defensive programming.
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

echo "Info: Running repomix and sending to OpenRouter..." >&2
echo "--- AI Response ---" >&2

# --- Step 2 & 3: The Pipeline ---
# 1. repomix runs with --stdout and any script arguments ("$@").
# 2. Its output is piped to awk, which constructs the JSON payload.
# 3. awk's output is piped to curl's stdin using -d @-.
# 4. curl's JSON response is piped to jq, which extracts the message content.
repomix --stdout "$@" | \
awk -v model="$CODE_AUDITOR_MODEL" -v prompt="$PROMPT_CONTENT" '
BEGIN {
  # Start JSON structure
  printf "{\n";
  printf "  \"model\": \"%s\",\n", model;
  printf "  \"messages\": [\n";
  
  # --- System Message (from prompt variable) ---
  printf "    {\n";
  printf "      \"role\": \"system\",\n";
  
  # Escape the prompt content for JSON
  escaped_prompt = prompt;
  gsub(/\\/, "\\\\", escaped_prompt);
  gsub(/"/, "\\\"", escaped_prompt);
  gsub(/\n/, "\\n", escaped_prompt);
  gsub(/\r/, "\\r", escaped_prompt);
  gsub(/\t/, "\\t", escaped_prompt);
  
  printf "      \"content\": \"%s\"\n", escaped_prompt;
  printf "    },\n";

  # --- User Message (from piped repomix data) ---
  printf "    {\n";
  printf "      \"role\": \"user\",\n";
  printf "      \"content\": \"";
}
# Main block: process each line from repomix stdin
{
  gsub(/\\/, "\\\\");
  gsub(/"/, "\\\"");
  printf "%s\\n", $0;
}
END {
  # Close the JSON structure
  printf "\"\n";
  printf "    }\n";
  printf "  ]\n";
  printf "}\n";
}
' | \
curl -s -X POST "$OPENROUTER_URL" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- | \
jq -r .choices[0].message.content

# --- Step 4: Done ---
echo >&2
echo "---" >&2
echo "Info: Done." >&2

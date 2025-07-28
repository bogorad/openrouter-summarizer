#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status.
set -e
set -o pipefail

# --- Dependency Checks ---
command -v repomix >/dev/null 2>&1 || { echo >&2 "Error: 'repomix' is not installed. Aborting."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo >&2 "Error: 'curl' is not installed. Aborting."; exit 1; }
command -v awk >/dev/null 2>&1 || { echo >&2 "Error: 'awk' is not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo >&2 "Error: 'jq' is not installed. Aborting."; exit 1; }

#############################################################
# --- Environment Variable Handling ---
echo "Info: Checking API key sources..." >&2

# Check secret file first
if [[ -f "/run/secrets/api_keys/openrouter" ]]; then
  OPENROUTER_API_KEY=$(tr -d '[:space:]' < "/run/secrets/api_keys/openrouter")
  export OPENROUTER_API_KEY
  echo "Info: Loaded API key from secret file" >&2
else
  echo "Info: Secret file not found at /run/secrets/api_keys/openrouter" >&2
fi

# Check .env file
if [[ -f ".env" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^# ]] && continue
    [[ -z "$key" ]] && continue
    
    case "$key" in
      OPENROUTER_API_KEY|CODE_AUDITOR_MODEL)
        value="${value%\"}"
        value="${value#\"}"
        value="${value%'}"
        value="${value#'}"
        
        if [[ -z "${!key:-}" ]]; then
          export "$key=$value"
          echo "Info: Loaded $key from .env" >&2
        fi
        ;;
    esac
  done < <(grep -E '^(OPENROUTER_API_KEY|CODE_AUDITOR_MODEL)=' .env)
else
  echo "Info: .env file not found" >&2
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
# --- Model Validation ---
echo "Info: Testing model '$CODE_AUDITOR_MODEL'..." >&2
PING_REQUEST_JSON=$(jq -nc \
  --arg model "$CODE_AUDITOR_MODEL" \
  '{ "model": $model, "max_tokens": 1, "messages": [{"role":"user","content":"ping"}] }')

# Capture full response with status code
_RESPONSE=$(curl -sS -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PING_REQUEST_JSON" \
  -w "\n%{http_code}")

# Process response
_HTTP_STATUS=$(tail -n1 <<< "${_RESPONSE}")
_BODY=$(sed '$d' <<< "${_RESPONSE}")

if [ "${_HTTP_STATUS}" != "200" ]; then
  echo >&2 "Error: Model validation failed (HTTP ${_HTTP_STATUS})"
  if [ -n "${_BODY}" ] && jq empty <<< "${_BODY}" 2>/dev/null; then
    jq . >&2 <<< "${_BODY}"
  else
    printf '%s\n' "${_BODY}" >&2
  fi
  exit 1
fi
echo "Info: Model '$CODE_AUDITOR_MODEL' is valid" >&2
#############################################################

# --- Define System Prompt ---
PROMPT_CONTENT=$(cat <<'EOF'
You are a world-class senior staff software engineer and cybersecurity expert...
[... same prompt content as before ...]
Here is the codebase:
EOF
)

#############################################################
# MAIN EXECUTION (clean pipeline)
#############################################################
echo "--- AI Response ---" >&2

# 1. Generate payload to tmp file
payload_file=$(mktemp) || exit 1
response_file=$(mktemp) || { rm -f "$payload_file"; exit 1; }
trap 'rm -f "$payload_file" "$response_file"' EXIT

# Build payload
if ! repomix --stdout "$@" | awk -v model="$CODE_AUDITOR_MODEL" -v prompt="$PROMPT_CONTENT" '
BEGIN {
  printf "{\n"
  printf "  \"model\": \"%s\",\n", model
  printf "  \"messages\": [\n"
  
  # System message
  printf "    {\n"
  printf "      \"role\": \"system\",\n"
  escaped_prompt = prompt
  gsub(/\\/, "\\\\", escaped_prompt)
  gsub(/"/, "\\\"", escaped_prompt)
  gsub(/\n/, "\\n", escaped_prompt)
  gsub(/\r/, "\\r", escaped_prompt)
  gsub(/\t/, "\\t", escaped_prompt)
  printf "      \"content\": \"%s\"\n", escaped_prompt
  printf "    },\n"

  # User message (start)
  printf "    {\n"
  printf "      \"role\": \"user\",\n"
  printf "      \"content\": \""
}
{
  gsub(/\\/, "\\\\")
  gsub(/"/, "\\\"")
  gsub(/\r/, "\\r")
  gsub(/\t/, "\\t")
  printf "%s\\n", $0
}
END {
  printf "\"\n"
  printf "    }\n"
  printf "  ]\n"
  printf "}\n"
}' > "$payload_file"; then
  echo >&2 "Error: Failed to generate request payload"
  exit 1
fi

# 2. Send request and handle response
if ! curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "@$payload_file" | { HTTP_STATUS=$(cat); test "$HTTP_STATUS" = "200"; }; then
  
  # Handle API errors
  echo >&2 "Error: API request failed (HTTP $HTTP_STATUS)"
  if [ -s "$response_file" ]; then
    echo "Response:" >&2
    if jq empty "$response_file" 2>/dev/null; then
      jq . >&2 "$response_file"
    else
      cat "$response_file" >&2
    fi
  fi
  exit 1
fi

# 3. Output ONLY model content to stdout (all else is stderr)
jq -r '.choices[0].message.content' "$response_file"

# Done notification (stderr)
echo >&2
echo "---" >&2
echo "Info: Processing complete" >&2

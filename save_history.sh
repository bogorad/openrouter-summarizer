#!/usr/bin/env bash

# --- Configuration ---
# The file containing the latest chat history to be archived.
SOURCE_FILE=".aider.chat.history.md"
# The directory where daily chat history logs will be stored.
TARGET_DIR="./chat_history"

# --- Ensure Target Directory Exists ---
if [ ! -d "$TARGET_DIR" ]; then
  echo "Target directory '$TARGET_DIR' not found. Creating it..."
  mkdir -p "$TARGET_DIR"
  # Check if directory creation was successful.
  if [ $? -ne 0 ]; then
    echo "Error: Failed to create directory '$TARGET_DIR'. Please check permissions."
    exit 1 # Exit with an error code.
  fi
fi

# Check if the source file exists in the current directory.
if [ ! -f "$SOURCE_FILE" ]; then
  echo "Info: Source file '$SOURCE_FILE' not found. Nothing to append."
  exit 0 # Exit with success status code.
fi

# --- Determine Target File ---
TODAY_DATE=$(date +'%Y-%m-%d')
TARGET_FILENAME="${TODAY_DATE}.md"
TARGET_FILE_PATH="${TARGET_DIR}/${TARGET_FILENAME}"

echo "Target log file: '$TARGET_FILE_PATH'"

# Check if the target file already exists. If it does, it means we are
# appending a subsequent session for the same day, so add a separator first.
if [ -f "$TARGET_FILE_PATH" ]; then
  echo "Adding Markdown separator to '$TARGET_FILE_PATH'..."
  # -e enables interpretation of backslash escapes (like \n for newline).
  echo -e "\n\n---\n\n## New Session Appended: *$(date '+%Y-%m-%d %H:%M:%S')*\n\n---\n\n" >> "$TARGET_FILE_PATH"
  # Check if writing the separator failed.
  if [ $? -ne 0 ]; then
    echo "Error: Failed to write separator to '$TARGET_FILE_PATH'."
    exit 1 # Exit with an error code.
  fi
fi

echo "Appending content from '$SOURCE_FILE' to '$TARGET_FILE_PATH'..."
cat "$SOURCE_FILE" >> "$TARGET_FILE_PATH"

# Check if the append operation (cat) was successful.
if [ $? -ne 0 ]; then
  echo "Error: Failed to append content to '$TARGET_FILE_PATH'."
  # Do not remove the source file if appending failed, to avoid data loss.
  exit 1 # Exit with an error code.
fi

# --- Remove Source File ---
# If appending was successful, remove the original source file.
echo "Removing source file '$SOURCE_FILE'..."
rm "$SOURCE_FILE"
# Check if the removal was successful.
if [ $? -ne 0 ]; then
  echo "Warning: Content was appended to '$TARGET_FILE_PATH', but failed to remove source file '$SOURCE_FILE'."
  # Exit with a different non-zero status to indicate incomplete cleanup,
  # even though the main goal (appending) was achieved.
  exit 2
fi

# --- Success Message ---
echo "Successfully appended chat history to '$TARGET_FILE_PATH' and removed source file."

exit 0

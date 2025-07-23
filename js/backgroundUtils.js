// js/backgroundUtils.js

export function isTabClosedError(error) {
  if (!error || !error.message) return false;
  return (
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("message channel closed")
  );
}



export function getSystemPrompt(promptTemplate, language, bulletCount) {
  // Convert bullet count number to word
  const numToWord = {
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
  };

  const bulletCountWord = numToWord[parseInt(bulletCount)] || "five";

  return promptTemplate
    .replace('$$$language$$$', language)
    .replace('$$$bulletCount$$$', bulletCountWord);
}
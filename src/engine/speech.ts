export function speakJapanese(text: string, slow = false): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = slow ? 0.72 : 0.96;

    const voices = window.speechSynthesis.getVoices();
    const jpVoice =
      voices.find((v) => v.lang.startsWith("ja") && /Kyoko|Otoya|Siri|Enhanced/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("ja"));
    if (jpVoice) {
      utterance.voice = jpVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis is optional enhancement
  }
}

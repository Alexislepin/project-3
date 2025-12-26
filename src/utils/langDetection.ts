/**
 * Simple language detection based on common English words
 * Returns 'en' if text appears to be English, 'fr' otherwise
 */
export function detectLanguage(text: string | null | undefined): 'fr' | 'en' {
  if (!text || text.trim().length === 0) {
    return 'fr'; // Default to French
  }

  const lowerText = text.toLowerCase();
  
  // Common English words (high frequency)
  const englishWords = [
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'from', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'this', 'that', 'these', 'those', 'a', 'an', 'it', 'its', 'they', 'them',
    'their', 'there', 'then', 'than', 'what', 'when', 'where', 'why', 'how',
    'which', 'who', 'whom', 'whose', 'can', 'may', 'might', 'must', 'shall'
  ];

  // Count English words
  let englishWordCount = 0;
  const words = lowerText.split(/\s+/);
  const totalWords = words.length;

  for (const word of words) {
    // Remove punctuation
    const cleanWord = word.replace(/[.,!?;:()\[\]{}'"]/g, '');
    if (englishWords.includes(cleanWord)) {
      englishWordCount++;
    }
  }

  // If more than 20% of words are common English words, consider it English
  const englishRatio = totalWords > 0 ? englishWordCount / totalWords : 0;
  
  return englishRatio > 0.2 ? 'en' : 'fr';
}


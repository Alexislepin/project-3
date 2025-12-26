export function formatDescription(description: string | undefined, maxLength: number = 280): string {
  if (!description) return '';

  description = description.trim();

  if (description.length <= maxLength) {
    return description;
  }

  const sentences = description.match(/[^.!?]+[.!?]+/g) || [];

  let result = '';
  for (const sentence of sentences) {
    if ((result + sentence).length > maxLength) {
      break;
    }
    result += sentence;
  }

  if (result.length === 0) {
    result = description.substring(0, maxLength - 3) + '...';
  } else if (result.length < description.length) {
    result = result.trim();
    if (!result.match(/[.!?]$/)) {
      result += '...';
    }
  }

  return result;
}

export function cleanDescription(description: string | undefined): string {
  if (!description) return '';

  let cleaned = description.trim();

  cleaned = cleaned.replace(/<[^>]+>/g, '');

  cleaned = cleaned.replace(/\s+/g, ' ');

  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');

  return cleaned;
}

export function smartFormatDescription(description: string | undefined, maxLength: number = 280): string {
  const cleaned = cleanDescription(description);
  return formatDescription(cleaned, maxLength);
}

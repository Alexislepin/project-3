# Translate Edge Function

Translates text using DeepL API and caches results in `book_translations` table.

## Environment Variables

- `DEEPL_API_KEY`: DeepL API key (required)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for cache)
- `SUPABASE_URL`: Supabase project URL

## Request

```json
{
  "text": "Text to translate",
  "target": "fr" | "en",
  "book_id": "optional-uuid-for-caching"
}
```

## Response

```json
{
  "translatedText": "Translated text"
}
```

## Features

- Caches translations in `book_translations` table
- Falls back to original text if DeepL API fails
- Auto-detects source language


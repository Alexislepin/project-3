/**
 * Logger utility for development and production
 * Only logs in development mode (import.meta.env.DEV)
 */

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const debugLog = (...args: any[]) => {
  if (isDev) {
    console.log(...args);
  }
};

export const debugWarn = (...args: any[]) => {
  if (isDev) {
    console.warn(...args);
  }
};

export const debugError = (...args: any[]) => {
  if (isDev) {
    console.error(...args);
  }
};

// Always log fatal errors (even in production)
export const fatalError = (...args: any[]) => {
  console.error('❌ FATAL:', ...args);
};


// Application error codes: the union of 04_ADAPTER_SDK §4 and 16_IPC §5 (OPEN_QUESTIONS C-02),
// plus FORBIDDEN_SENDER for IPC sender verification (M2). Messages are safe to show to users and
// never contain request data, file paths or library messages.

export const APP_ERROR_CODES = [
  'VALIDATION_FAILED',
  'FORBIDDEN_SENDER',
  'AUTH_REQUIRED',
  'OTP_REQUIRED',
  'MANUAL_ACTION_REQUIRED',
  'PORTAL_UNAVAILABLE',
  'NAVIGATION_TIMEOUT',
  'FIELD_NOT_FOUND',
  'PARSE_FAILED',
  'QUOTE_NOT_AVAILABLE',
  'RATE_LIMITED',
  'UNSUPPORTED_FLOW',
  'CANCELLED',
  'STORAGE_ERROR',
  'SECRET_STORE_UNAVAILABLE',
  'PDF_GENERATION_FAILED',
  'INTERNAL_ERROR',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const ERROR_INFO: Readonly<Record<AppErrorCode, { message: string; retryable: boolean }>> = {
  VALIDATION_FAILED: {
    message: 'Some details are invalid. Correct the highlighted fields.',
    retryable: false,
  },
  FORBIDDEN_SENDER: { message: 'This request was not accepted.', retryable: false },
  AUTH_REQUIRED: { message: 'Sign in to continue.', retryable: true },
  OTP_REQUIRED: { message: 'Complete the OTP step in the insurer window.', retryable: true },
  MANUAL_ACTION_REQUIRED: {
    message: 'This step needs you to act in the insurer window.',
    retryable: true,
  },
  PORTAL_UNAVAILABLE: {
    message: 'The insurer portal is unavailable. Try later or enter the quote manually.',
    retryable: true,
  },
  NAVIGATION_TIMEOUT: { message: 'The insurer portal took too long to respond.', retryable: true },
  FIELD_NOT_FOUND: {
    message: 'The insurer portal has changed. Use manual entry.',
    retryable: false,
  },
  PARSE_FAILED: {
    message: 'The quote could not be read reliably. Review it before use.',
    retryable: false,
  },
  QUOTE_NOT_AVAILABLE: {
    message: 'No quote was returned. Review eligibility and details.',
    retryable: false,
  },
  RATE_LIMITED: {
    message: 'The insurer is limiting requests. Wait before trying again.',
    retryable: true,
  },
  UNSUPPORTED_FLOW: {
    message: 'This insurer flow is not supported. Use manual entry.',
    retryable: false,
  },
  CANCELLED: { message: 'The request was cancelled.', retryable: false },
  STORAGE_ERROR: {
    message: 'Local data could not be saved. Your data has been protected.',
    retryable: false,
  },
  SECRET_STORE_UNAVAILABLE: {
    message: 'Secure storage is unavailable. Nothing was saved.',
    retryable: false,
  },
  PDF_GENERATION_FAILED: {
    message: 'The PDF could not be created. Review the report and try again.',
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: 'Something went wrong. Share the reference with support.',
    retryable: false,
  },
};

export const formatCaughtError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return error;
};

export const warnCaught = (message: string, error: unknown) => {
  console.warn(message, formatCaughtError(error));
};

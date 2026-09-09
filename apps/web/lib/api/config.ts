export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL;

  if (!value) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }

  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== value
    ) {
      throw new Error();
    }

    return value;
  } catch {
    throw new Error("NEXT_PUBLIC_API_URL must be an exact HTTP origin");
  }
}

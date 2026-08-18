export interface ApiErrorBody {
  code: string
  message: string
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: HeadersInit,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export function errorResponse(
  error: ApiErrorBody,
  status: number,
  headers: HeadersInit,
) {
  return jsonResponse({ error }, status, headers)
}

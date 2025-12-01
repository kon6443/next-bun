export type HTTPMethodType = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type QueryPrimitive = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryPrimitive | QueryPrimitive[]>;

type ExtendedRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

type FetchClientOptions = Omit<ExtendedRequestInit, 'headers'> & {
  headers?: Record<string, string>;
  cookies?: string | Record<string, string>;
};

type BackendFetchArgs = FetchClientOptions & {
  method: HTTPMethodType;
  endpoint: string;
  query?: QueryParams;
  body?: unknown;
};

class FetchClient {
  #serverBaseUrl: string;

  constructor(serverBaseUrl: string) {
    this.#serverBaseUrl = serverBaseUrl;
  }

  fetch(endpoint: string, options?: FetchClientOptions) {
    return this.request(endpoint, options);
  }

  ssr(endpoint: string, options?: FetchClientOptions) {
    return this.request(endpoint, { cache: 'no-store', ...options });
  }

  ssg(endpoint: string, options?: FetchClientOptions) {
    return this.request(endpoint, { cache: 'force-cache', ...options });
  }

  isr(endpoint: string, time = 0, options?: FetchClientOptions) {
    const mergedNext = {
      ...(options?.next ?? {}),
      revalidate: options?.next?.revalidate ?? time,
    };
    return this.request(endpoint, { ...options, next: mergedNext });
  }

  backendFetch({ method, endpoint, query, body, headers, ...options }: BackendFetchArgs) {
    const normalizedBody = this.normalizeBody(body);
    const targetEndpoint = this.appendQuery(endpoint, query);
    return this.request(targetEndpoint, {
      ...options,
      method,
      headers,
      body: normalizedBody,
    });
  }

  private request(endpoint: string, options?: FetchClientOptions) {
    const { cookies, headers: customHeaders, body, credentials, ...rest } = options ?? {};

    const url = this.createUrl(endpoint);
    const headers = this.buildHeaders(customHeaders, body);
    const cookieHeader = this.serializeCookies(cookies);

    if (cookieHeader && typeof window === 'undefined') {
      headers['Cookie'] = cookieHeader;
    }

    const init: ExtendedRequestInit = {
      credentials: credentials ?? 'same-origin',
      ...rest,
      headers,
      body,
    };

    return fetch(url, init);
  }

  private createUrl(endpoint: string) {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    if (!this.#serverBaseUrl) {
      return endpoint;
    }

    const baseEndsWithSlash = this.#serverBaseUrl.endsWith('/');
    const pathStartsWithSlash = endpoint.startsWith('/');

    if (baseEndsWithSlash && pathStartsWithSlash) {
      return `${this.#serverBaseUrl}${endpoint.slice(1)}`;
    }

    if (!baseEndsWithSlash && !pathStartsWithSlash) {
      return `${this.#serverBaseUrl}/${endpoint}`;
    }

    return `${this.#serverBaseUrl}${endpoint}`;
  }

  private appendQuery(endpoint: string, query?: QueryParams) {
    if (!query) {
      return endpoint;
    }

    const qs = this.buildQueryString(query);
    if (!qs) {
      return endpoint;
    }

    return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${qs}`;
  }

  private buildQueryString(query: QueryParams) {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item === undefined || item === null) {
            return;
          }
          params.append(key, String(item));
        });
        return;
      }

      params.append(key, String(value));
    });

    return params.toString();
  }

  private buildHeaders(headers?: Record<string, string>, body?: BodyInit | null) {
    const normalizedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(headers ?? {}),
    };

    if (!body || this.shouldSkipJsonHeader(body)) {
      return normalizedHeaders;
    }

    if (!normalizedHeaders['Content-Type']) {
      normalizedHeaders['Content-Type'] = 'application/json';
    }

    return normalizedHeaders;
  }

  private shouldSkipJsonHeader(body: BodyInit) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      return true;
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      return true;
    }
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
      return true;
    }
    return false;
  }

  private normalizeBody(body: unknown): BodyInit | undefined {
    if (body === undefined || body === null) {
      return undefined;
    }

    if (this.isBodyInit(body)) {
      return body;
    }

    return JSON.stringify(body);
  }

  private isBodyInit(value: unknown): value is BodyInit {
    if (typeof value === 'string') {
      return true;
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return true;
    }

    if (typeof FormData !== 'undefined' && value instanceof FormData) {
      return true;
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return true;
    }

    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
      return true;
    }

    if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
      return true;
    }

    if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) {
      return true;
    }

    return false;
  }

  private serializeCookies(cookies?: string | Record<string, string>) {
    if (!cookies) {
      return undefined;
    }

    if (typeof cookies === 'string') {
      return cookies;
    }

    const serialized = Object.entries(cookies)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');

    return serialized || undefined;
  }
}

const fetchServiceInstance = new FetchClient(process.env.NEXT_PUBLIC_API ?? '');
export default fetchServiceInstance;
export { FetchClient };

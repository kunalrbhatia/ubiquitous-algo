import { HttpClient } from '../src/http/httpClient';

describe('HttpClient', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  test('request success first attempt', async () => {
    const client = new HttpClient({ retries: 2, backoffMs: 1 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'success' }),
    });

    const res = await client.request<{ data: string }>('http://test.com');
    expect(res.data).toBe('success');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('request retries and succeeds on second attempt', async () => {
    const client = new HttpClient({ retries: 3, backoffMs: 1 });
    mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'retry-success' }),
    });

    const res = await client.request<{ data: string }>('http://test.com');
    expect(res.data).toBe('retry-success');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('request fails after maximum retries', async () => {
    const client = new HttpClient({ retries: 2, backoffMs: 1 });
    mockFetch.mockRejectedValue(new Error('Persistent failure'));

    await expect(client.request('http://test.com')).rejects.toThrow(
      'Request failed after 2 attempts',
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('request fails if response not ok', async () => {
    const client = new HttpClient({ retries: 1, backoffMs: 1 });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Database offline',
    });

    await expect(client.request('http://test.com')).rejects.toThrow('HTTP Error 500');
  });

  test('request throws AbortError (timeout check)', async () => {
    const client = new HttpClient({ retries: 1, backoffMs: 1 });
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(client.request('http://test.com')).rejects.toThrow(
      'Request failed after 1 attempts',
    );
  });

  test('unreachable loop exit path with 0 retries', async () => {
    const client = new HttpClient({ retries: 0 });
    await expect(client.request('http://test.com')).rejects.toThrow('Unreachable');
  });
});

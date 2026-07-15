import { SessionManager } from '../src/auth/session';
import httpClient from '../src/http/httpClient';
import fs from 'fs';

jest.mock('fs');
jest.mock('../src/http/httpClient');

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    sessionManager = new SessionManager();
  });

  test('getters throw error before login', () => {
    expect(() => sessionManager.getJwtToken()).toThrow();
    expect(() => sessionManager.getFeedToken()).toThrow();
    expect(() => sessionManager.getRefreshToken()).toThrow();
  });

  test('login succeeds and updates tokens', async () => {
    const mockResponse = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'mock_jwt',
        refreshToken: 'mock_refresh',
        feedToken: 'mock_feed',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockResponse);

    await sessionManager.login();

    expect(sessionManager.getJwtToken()).toBe('mock_jwt');
    expect(sessionManager.getRefreshToken()).toBe('mock_refresh');
    expect(sessionManager.getFeedToken()).toBe('mock_feed');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('login fails when status is false', async () => {
    const mockResponse = {
      status: false,
      message: 'Invalid password',
      errorcode: 'AB100',
      data: {
        jwtToken: '',
        refreshToken: '',
        feedToken: '',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockResponse);

    await expect(sessionManager.login()).rejects.toThrow('Login response status is false');
  });

  test('login handles request errors', async () => {
    (httpClient.request as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));
    await expect(sessionManager.login()).rejects.toThrow('Connection failed');
  });

  test('refreshSession succeeds and updates tokens', async () => {
    const mockLoginRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'mock_jwt_1',
        refreshToken: 'mock_refresh_1',
        feedToken: 'mock_feed_1',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockLoginRes);
    await sessionManager.login();

    const mockRefreshRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'mock_jwt_2',
        refreshToken: 'mock_refresh_2',
        feedToken: 'mock_feed_2',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockRefreshRes);

    await sessionManager.refreshSession();

    expect(sessionManager.getJwtToken()).toBe('mock_jwt_2');
    expect(sessionManager.getRefreshToken()).toBe('mock_refresh_2');
  });

  test('refreshSession throws error if no refresh token exists', async () => {
    await expect(sessionManager.refreshSession()).rejects.toThrow('Cannot refresh token');
  });

  test('refreshSession throws if status is false', async () => {
    const mockLoginRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'mock_jwt_1',
        refreshToken: 'mock_refresh_1',
        feedToken: 'mock_feed_1',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockLoginRes);
    await sessionManager.login();

    (httpClient.request as jest.Mock).mockResolvedValueOnce({
      status: false,
      message: 'Token expired',
      errorcode: 'AB101',
    });

    await expect(sessionManager.refreshSession()).rejects.toThrow(
      'RenewToken response status is false',
    );
  });

  test('refreshSession handles network errors', async () => {
    const mockLoginRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'mock_jwt_1',
        refreshToken: 'mock_refresh_1',
        feedToken: 'mock_feed_1',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockLoginRes);
    await sessionManager.login();

    (httpClient.request as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    await expect(sessionManager.refreshSession()).rejects.toThrow('Network error');
  });

  test('loads session from disk if valid', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const mockData = {
      jwtToken: 'disk_jwt',
      refreshToken: 'disk_refresh',
      feedToken: 'disk_feed',
      loginTime: Date.now(),
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));

    expect(sessionManager.getJwtToken()).toBe('disk_jwt');
    expect(sessionManager.getRefreshToken()).toBe('disk_refresh');
    expect(sessionManager.getFeedToken()).toBe('disk_feed');
  });

  test('does not load session from disk if expired/not from today', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const mockData = {
      jwtToken: 'disk_jwt',
      refreshToken: 'disk_refresh',
      feedToken: 'disk_feed',
      loginTime: Date.now() - 24 * 60 * 60 * 1000 * 2, // 2 days ago
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));

    expect(() => sessionManager.getJwtToken()).toThrow();
  });

  test('handles invalid json or errors when reading from disk', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Disk read error');
    });

    expect(() => sessionManager.getJwtToken()).toThrow();
  });

  test('refreshSession loads from disk if token is not in memory', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const mockData = {
      jwtToken: 'disk_jwt',
      refreshToken: 'disk_refresh',
      feedToken: 'disk_feed',
      loginTime: Date.now(),
    };
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));

    const mockRefreshRes = {
      status: true,
      message: 'SUCCESS',
      errorcode: '0000',
      data: {
        jwtToken: 'new_disk_jwt',
        refreshToken: 'new_disk_refresh',
        feedToken: 'new_disk_feed',
      },
    };
    (httpClient.request as jest.Mock).mockResolvedValueOnce(mockRefreshRes);

    await sessionManager.refreshSession();

    expect(sessionManager.getJwtToken()).toBe('new_disk_jwt');
    expect(sessionManager.getRefreshToken()).toBe('new_disk_refresh');
    expect(sessionManager.getFeedToken()).toBe('new_disk_feed');
  });
});

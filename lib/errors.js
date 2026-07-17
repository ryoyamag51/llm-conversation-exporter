// lib/errors.js — 共通エラークラス定義
// AuthError / NotFoundError / ApiError / DomError
// 全 extractor で共有し、エラー判定ロジックの重複を防ぐ

export class AuthError extends Error {
  constructor(message = '認証エラー: ログインを確認してください。') {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  constructor(message = '会話が見つかりません。') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ApiError extends Error {
  constructor(message = 'API エラーが発生しました。') {
    super(message);
    this.name = 'ApiError';
  }
}

export class DomError extends Error {
  constructor(message = 'DOM からのコンテンツ取得に失敗しました。') {
    super(message);
    this.name = 'DomError';
  }
}

// レスポンス → 値 or エラークラスに変換（fetchDirect / background 結果の両方で使用）
// エラー判定ロジックを一箇所に集約
export function parseResponse({ status, ok, data }) {
  if (status === 401 || status === 403)
    throw new AuthError('セッションが無効です。ログインを確認してください。');
  if (status === 404)
    throw new NotFoundError('会話が見つかりません。');
  if (!ok)
    throw new ApiError(`API エラー: ${status}`);
  return data;
}

export const USER_ROLES = {
  MEN: 'men',
  WOMEN: 'women',
};

export const CALL_STATUS = {
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
};

export const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const REPORT_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  DISMISSED: 'dismissed',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

export const COIN_PACKAGES = [
  { amount: 20, coins: 200, bonus: 0 },
  { amount: 50, coins: 550, bonus: 50 },
  { amount: 100, coins: 1200, bonus: 200 },
  { amount: 500, coins: 6500, bonus: 1500 },
  { amount: 1000, coins: 14000, bonus: 4000 },
];

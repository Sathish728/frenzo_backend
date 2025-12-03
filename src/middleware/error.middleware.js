import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ApiError(HTTP_STATUS.BAD_REQUEST, 'Validation error', errors);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    error = new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `${field} already exists`
    );
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    error = new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid ID format');
  }

  // Default error
  if (!(error instanceof ApiError)) {
    error = new ApiError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Internal server error'
    );
  }

  // Log error
  logger.error(`${error.statusCode} - ${error.message}`, {
    error: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  // Send response
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    errors: error.errors,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req, res, next) => {
  const error = new ApiError(
    HTTP_STATUS.NOT_FOUND,
    `Route ${req.originalUrl} not found`
  );
  next(error);
};
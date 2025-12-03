import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';

export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'Validation error',
        errors
      );
    }

    next();
  };
};
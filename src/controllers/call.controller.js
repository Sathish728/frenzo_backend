import { Call } from '../models/Call.model.js';
import { CallService } from '../services/call.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';

const callService = new CallService();

export class CallController {
  static async getICEServers(req, res, next) {
    try {
      const iceServers = callService.getICEServers();

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(HTTP_STATUS.OK, iceServers, 'ICE servers retrieved')
        );
    } catch (error) {
      next(error);
    }
  }

  static async getCallHistory(req, res, next) {
    try {
      const { page, limit, skip } = helpers.getPaginationParams(
        req.query.page,
        req.query.limit
      );

      const query =
        req.userRole === 'men'
          ? { menUserId: req.userId }
          : { womenUserId: req.userId };

      const [calls, total] = await Promise.all([
        Call.find(query)
          .populate('menUserId', 'name profileImage')
          .populate('womenUserId', 'name profileImage')
          .sort({ startTime: -1 })
          .limit(limit)
          .skip(skip),
        Call.countDocuments(query),
      ]);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            calls,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
          'Call history retrieved'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  static async getCallStats(req, res, next) {
    try {
      const query =
        req.userRole === 'men'
          ? { menUserId: req.userId }
          : { womenUserId: req.userId };

      const stats = await Call.aggregate([
        { $match: { ...query, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalDuration: { $sum: '$duration' },
            totalCoins: { $sum: '$coinsUsed' },
          },
        },
      ]);

      const result = stats[0] || {
        totalCalls: 0,
        totalDuration: 0,
        totalCoins: 0,
      };

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(HTTP_STATUS.OK, result, 'Call stats retrieved')
        );
    } catch (error) {
      next(error);
    }
  }
}

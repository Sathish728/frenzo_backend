export const helpers = {
  // Generate OTP
  generateOTP: (length = 6) => {
    return Math.floor(
      Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)
    ).toString();
  },

  // Calculate coins to money
  coinsToMoney: (coins, rate = 50) => {
    return Math.floor((coins / 1000) * rate);
  },

  // Format duration
  formatDuration: (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  },

  // Generate random string
  generateRandomString: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  },

  // Sanitize phone number
  sanitizePhone: (phone) => {
    return phone.replace(/\D/g, '');
  },

  // Validate email
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate phone
  isValidPhone: (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Truncate string
  truncateString: (str, maxLength) => {
    if (str.length <= maxLength) return str;
    return `${str.substring(0, maxLength)}...`;
  },

  // Debounce
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Pagination helper
  getPaginationParams: (page = 1, limit = 20) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    return { page: pageNum, limit: limitNum, skip };
  },
};
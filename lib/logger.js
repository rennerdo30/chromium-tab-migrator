/**
 * Structured Logger for Browser Tab Migrator
 * Handles console logging and UI event dispatching
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

class Logger {
    constructor() {
        this.logs = [];
        this.listeners = [];
    }

    /**
     * Log an event
     * @param {string} level - Log level key (DEBUG, INFO, WARN, ERROR)
     * @param {string} action - Action identifier (e.g., 'EXPORT_START')
     * @param {object} data - Structured data to log
     * @param {Error} error - Optional error object
     */
    log(level, action, data = {}, error = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            action,
            data,
            error: error ? { message: error.message, stack: error.stack } : null
        };

        // Console output with color
        const prefix = `[TabMigrator] [${level}] ${action}`;
        const args = [prefix, data];
        if (error) args.push(error);

        switch (level) {
            case 'DEBUG': console.debug(...args); break;
            case 'INFO': console.info(...args); break;
            case 'WARN': console.warn(...args); break;
            case 'ERROR': console.error(...args); break;
        }

        // Store in history (capped)
        this.logs.push(entry);
        if (this.logs.length > 1000) this.logs.shift();

        // Notify listeners (UI)
        this.notifyListeners(entry);
    }

    info(action, data) { this.log('INFO', action, data); }
    warn(action, data) { this.log('WARN', action, data); }
    error(action, data, err) { this.log('ERROR', action, data, err); }
    debug(action, data) { this.log('DEBUG', action, data); }

    onLog(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(entry) {
        this.listeners.forEach(cb => cb(entry));
    }
}

export const logger = new Logger();

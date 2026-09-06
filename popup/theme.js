/**
 * Theme bootstrap.
 *
 * Loaded as a classic (non-deferred) script in <head> so the stored preference is
 * applied to <html> before the first paint. Anything async (chrome.storage, module
 * scripts) would paint the default theme first and then flash to the chosen one.
 */
(() => {
    'use strict';

    const STORAGE_KEY = 'tab-migrator:theme';
    const THEME_ATTRIBUTE = 'data-theme';
    const THEME_DARK = 'dark';
    const THEME_LIGHT = 'light';
    const THEME_SYSTEM = 'system';
    const VALID_PREFERENCES = [THEME_DARK, THEME_LIGHT, THEME_SYSTEM];
    const LIGHT_MEDIA_QUERY = '(prefers-color-scheme: light)';

    /** Reads the stored preference, falling back to "system". */
    function readPreference() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return VALID_PREFERENCES.includes(stored) ? stored : THEME_SYSTEM;
        } catch (error) {
            // Storage can be unavailable (disabled or partitioned); "system" is a safe default.
            console.warn('[TabMigrator] Could not read theme preference', error);
            return THEME_SYSTEM;
        }
    }

    function systemTheme() {
        return window.matchMedia(LIGHT_MEDIA_QUERY).matches ? THEME_LIGHT : THEME_DARK;
    }

    /** Resolves "system" to the concrete theme currently in effect. */
    function resolve(preference) {
        return preference === THEME_SYSTEM ? systemTheme() : preference;
    }

    function apply(preference) {
        document.documentElement.setAttribute(THEME_ATTRIBUTE, resolve(preference));
    }

    function setPreference(preference) {
        const next = VALID_PREFERENCES.includes(preference) ? preference : THEME_SYSTEM;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (error) {
            console.warn('[TabMigrator] Could not persist theme preference', error);
        }
        apply(next);
        return next;
    }

    /** Flips between light and dark, pinning the choice so it stops tracking the OS. */
    function toggle() {
        return setPreference(resolve(readPreference()) === THEME_DARK ? THEME_LIGHT : THEME_DARK);
    }

    // Keep following the OS while the preference is "system".
    window.matchMedia(LIGHT_MEDIA_QUERY).addEventListener('change', () => {
        const preference = readPreference();
        if (preference === THEME_SYSTEM) apply(preference);
    });

    apply(readPreference());

    window.TabMigratorTheme = {
        THEME_DARK,
        THEME_LIGHT,
        THEME_SYSTEM,
        readPreference,
        resolvedTheme: () => resolve(readPreference()),
        setPreference,
        toggle,
    };
})();

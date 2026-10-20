import { config } from '../config/index.js';

/**
 * Simple header-based PIN gate to prevent casual access.
 * The frontend should send `x-ui-pin`.
 */
export function pinGate(req, res, next) {
  const provided = req.headers['x-ui-pin'] || req.body?.pin || req.query?.pin;

  if (!provided) {
    return res.status(401).json({
      error: 'PIN_REQUIRED',
      message: 'Submit the UI access PIN using the x-ui-pin header.'
    });
  }

  if (String(provided) !== String(config.uiAccessPin)) {
    return res.status(403).json({
      error: 'PIN_INVALID',
      message: 'The supplied PIN is incorrect.'
    });
  }

  return next();
}

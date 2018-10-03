'use strict';


const debug = require('./../debug').authentication

class ResetStorage {

    /**
     * Handles a clearCookie GET request on behalf of a middleware handler, clears
     * the cookies from the application.
     * Usage:
     *
     *   ```
     *   app.get('/reset', ResetStorage.reset)
     *   ```
     *
     * @param req {IncomingRequest}
     * @param res {ServerResponse}
     */
    static reset(req, res) {
        debug('Reset Cookies & Local Storage from the application')
        const cookies = req.cookies;
        for (let prop in cookies) {
            if (!cookies.hasOwnProperty(prop)) {
                continue;
            }
            res.cookie(prop, '', { exires: new Date(0) })
        }
        // if (typeof (localStorage) !== undefined) {
        //     localStorage.clear();
        // }
    }
}

module.exports = {
    ResetStorage
}

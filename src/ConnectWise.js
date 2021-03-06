/**
 * Created by kevin on 12/20/2015
 * @author kgrube
 */

/**
 * @private
 */
var request = require('request'),
  btoa = require('btoa');

/**
 * @const {string} DEFAULTS.apiPath
 * @const {string} DEFAULTS.apiVersion
 */
var DEFAULTS = {
  apiPath: '/apis/3.0'
};

/**
 * @param {object} options
 * @param {string} options.companyId
 * @param {string} options.publicKey
 * @param {string} options.privateKey
 * @param {string} options.companyUrl
 * @param {string} options.apiVersion
 * @param {string} [options.entryPoint] defaults to 'v4_6_release'
 * @param {number} [options.timeout] defaults to 5000 (5 seconds)
 * @constructor
 */
function ConnectWise(options) {
  this.options = options;

  if (!options) {
    throw new Error('Options must be defined');
  }

  if (!options.companyId) {
    throw new Error('companyId must be defined');
  }

  if (!options.publicKey) {
    throw new Error('publicKey must be defined');
  }

  if (!options.privateKey) {
    throw new Error('privateKey must be defined');
  }

  if (!options.companyUrl) {
    throw new Error('companyUrl must be defined');
  }

  if (!options.entryPoint) {
    options.entryPoint = 'v4_6_release';
  }

  if (!options.timeout) {
    options.timeout = 10000;
  }

  if (!options.apiVersion) {
    options.apiVersion = '3.0.0';
  }

  this.config = {};

  this.config.companyId = options.companyId;
  this.config.companyUrl = options.companyUrl;
  this.config.apiUrl = 'https://' + options.companyUrl + '/' + options.entryPoint + DEFAULTS.apiPath;
  this.config.apiVersion = options.apiVersion;
  this.config.publicKey = options.publicKey;
  this.config.privateKey = options.privateKey;
  this.config.authRaw = options.companyId + '+' + options.publicKey + ':' + options.privateKey;
  this.config.auth = 'Basic ' + btoa(this.config.authRaw);
  this.config.timeout = options.timeout;
}

/**
 *
 * @param {string} path API method path or full URL to perform method upon
 * @param {string} method HTTP method, GET, POST, PUT, PATCH, DELETE
 * @param {object} [params] if required by route, include required params
 *                          if a GET request, the params are joined into a string
 *                          if a POST/PUT/PATCH, the params are included in the body
 * @returns {Promise<*>}
 */
ConnectWise.prototype.api = function (path, method, params) {
  return new Promise((resolve, reject) => {
    if (!path) {
      throw new Error('path must be defined');
    }
    if (!method) {
      throw new Error('method must be defined');
    }

    var options = {
      url: this.config.apiUrl + path,
      headers: {
        'Accept': `application/json; application/vnd.connectwise.com+json; version=${this.config.apiVersion}`,
        'Cache-Control': 'no-cache',
        'Authorization': this.config.auth
      },
      method: method,
      timeout: this.config.timeout
    };

    //@TODO perform URL validation here
    if (path.match(/http:\/\//i) || path.match(/https:\/\//i)) {
      options.url = path;
    }

    if (method === 'GET' && params) {
      options.url += parameterize(params);
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(params);
    }

    return request(options, function (err, res) {
      if (err) {
        return reject({
          code: err.code,
          message: err.message,
          errors: [err]
        });
      } else {
        if (method === 'DELETE' && res.body === '' || method === 'POST' && res.statusCode === 204) {
          /** @type DeleteResponse */
          return resolve({});
        } else {
          try {
            var body = JSON.parse(res.body);
            if (body.code) {
              return reject(body);
            } else {
              return resolve(body);
            }
          } catch (e) {
            return reject({
              code: 'EPARSE',
              message: 'Error parsing response from server.',
              errors: [e]
            });
          }
        }
      }
    });
  });
};

/**
 * Wrap a module's function to get all results.
 * @param {function} fn
 * @param {object[]} args
 * @param {object} module
 * @param {string|number} [pageSize] defaults to 100
 * @param {string|number} [startPage] defaults to 0
 * @returns {Promise<*>}
 */
ConnectWise.prototype.paginate = function (fn, args, module, pageSize, startPage) {
  return new Promise((resolve, reject) => {
    var results = [];

    var page = startPage;
    if (startPage === undefined) {
      page = 0;
    }

    if (pageSize === undefined) {
      pageSize = 100;
    }

    getPage(page);

    function getPage(page) {

      function pageHandler(res) {
        if (res.length > 0) {
          results = results.concat(res);
        }

        if (res.length === pageSize) {
          getPage(++page);
        } else {
          return resolve(results);
        }
      }

      //inject page key into params arg
      args.forEach(function (arg) {
        for (var key in arg) {
          if (arg.hasOwnProperty(key)) {
            if (key === 'page' || key === 'pageSize' || key === 'conditions' || key === 'orderBy') {
              arg.page = page;
              arg.pageSize = pageSize;
            }
          }
        }
      });

      fn.apply(module, args)
        .then(pageHandler)
        .catch(function (err) {
          return reject(err);
        });
    }

  });
};

/**
 * Create a parameterized string for GET requests.
 * Able to use contains, like, etc
 * Example params object: { id: 1234, conditions: 'board=CTS Helpdesk and , orderBy: 'id' }
 * Returns: ?id=1234&conditions%2Fboard%2Fboard=Service%20Board&orderBy=id
 * @private
 * @param {object|string} params
 * @returns {string}
 */
function parameterize(params) {
  if (typeof params === "string") {
    return params;
  }

  var result = [];
  for (var param in params) {
    if (params.hasOwnProperty(param)) {
      result.push(param + '=' + params[param]);
    }
  }

  return encodeURI('?' + result.join('&'));
}

/**
 *
 * @type {ConnectWise}
 */
module.exports = ConnectWise;

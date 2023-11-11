"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.runOrb = exports.getStock = exports.getPositions = exports.getOption = exports.getLtpData = exports.generateSmartSession = exports.fetchData = exports.doOrder = void 0;
var _lodash = require("lodash");
var _dataStore = _interopRequireDefault(require("../store/dataStore"));
var _constants = require("./constants");
var _axios = _interopRequireDefault(require("axios"));
var _functions = require("./functions");
var _smartSession = _interopRequireDefault(require("../store/smartSession"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return e; }; var t, e = {}, r = Object.prototype, n = r.hasOwnProperty, o = Object.defineProperty || function (t, e, r) { t[e] = r.value; }, i = "function" == typeof Symbol ? Symbol : {}, a = i.iterator || "@@iterator", c = i.asyncIterator || "@@asyncIterator", u = i.toStringTag || "@@toStringTag"; function define(t, e, r) { return Object.defineProperty(t, e, { value: r, enumerable: !0, configurable: !0, writable: !0 }), t[e]; } try { define({}, ""); } catch (t) { define = function define(t, e, r) { return t[e] = r; }; } function wrap(t, e, r, n) { var i = e && e.prototype instanceof Generator ? e : Generator, a = Object.create(i.prototype), c = new Context(n || []); return o(a, "_invoke", { value: makeInvokeMethod(t, r, c) }), a; } function tryCatch(t, e, r) { try { return { type: "normal", arg: t.call(e, r) }; } catch (t) { return { type: "throw", arg: t }; } } e.wrap = wrap; var h = "suspendedStart", l = "suspendedYield", f = "executing", s = "completed", y = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var p = {}; define(p, a, function () { return this; }); var d = Object.getPrototypeOf, v = d && d(d(values([]))); v && v !== r && n.call(v, a) && (p = v); var g = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(p); function defineIteratorMethods(t) { ["next", "throw", "return"].forEach(function (e) { define(t, e, function (t) { return this._invoke(e, t); }); }); } function AsyncIterator(t, e) { function invoke(r, o, i, a) { var c = tryCatch(t[r], t, o); if ("throw" !== c.type) { var u = c.arg, h = u.value; return h && "object" == _typeof(h) && n.call(h, "__await") ? e.resolve(h.__await).then(function (t) { invoke("next", t, i, a); }, function (t) { invoke("throw", t, i, a); }) : e.resolve(h).then(function (t) { u.value = t, i(u); }, function (t) { return invoke("throw", t, i, a); }); } a(c.arg); } var r; o(this, "_invoke", { value: function value(t, n) { function callInvokeWithMethodAndArg() { return new e(function (e, r) { invoke(t, n, e, r); }); } return r = r ? r.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(e, r, n) { var o = h; return function (i, a) { if (o === f) throw new Error("Generator is already running"); if (o === s) { if ("throw" === i) throw a; return { value: t, done: !0 }; } for (n.method = i, n.arg = a;;) { var c = n.delegate; if (c) { var u = maybeInvokeDelegate(c, n); if (u) { if (u === y) continue; return u; } } if ("next" === n.method) n.sent = n._sent = n.arg;else if ("throw" === n.method) { if (o === h) throw o = s, n.arg; n.dispatchException(n.arg); } else "return" === n.method && n.abrupt("return", n.arg); o = f; var p = tryCatch(e, r, n); if ("normal" === p.type) { if (o = n.done ? s : l, p.arg === y) continue; return { value: p.arg, done: n.done }; } "throw" === p.type && (o = s, n.method = "throw", n.arg = p.arg); } }; } function maybeInvokeDelegate(e, r) { var n = r.method, o = e.iterator[n]; if (o === t) return r.delegate = null, "throw" === n && e.iterator["return"] && (r.method = "return", r.arg = t, maybeInvokeDelegate(e, r), "throw" === r.method) || "return" !== n && (r.method = "throw", r.arg = new TypeError("The iterator does not provide a '" + n + "' method")), y; var i = tryCatch(o, e.iterator, r.arg); if ("throw" === i.type) return r.method = "throw", r.arg = i.arg, r.delegate = null, y; var a = i.arg; return a ? a.done ? (r[e.resultName] = a.value, r.next = e.nextLoc, "return" !== r.method && (r.method = "next", r.arg = t), r.delegate = null, y) : a : (r.method = "throw", r.arg = new TypeError("iterator result is not an object"), r.delegate = null, y); } function pushTryEntry(t) { var e = { tryLoc: t[0] }; 1 in t && (e.catchLoc = t[1]), 2 in t && (e.finallyLoc = t[2], e.afterLoc = t[3]), this.tryEntries.push(e); } function resetTryEntry(t) { var e = t.completion || {}; e.type = "normal", delete e.arg, t.completion = e; } function Context(t) { this.tryEntries = [{ tryLoc: "root" }], t.forEach(pushTryEntry, this), this.reset(!0); } function values(e) { if (e || "" === e) { var r = e[a]; if (r) return r.call(e); if ("function" == typeof e.next) return e; if (!isNaN(e.length)) { var o = -1, i = function next() { for (; ++o < e.length;) if (n.call(e, o)) return next.value = e[o], next.done = !1, next; return next.value = t, next.done = !0, next; }; return i.next = i; } } throw new TypeError(_typeof(e) + " is not iterable"); } return GeneratorFunction.prototype = GeneratorFunctionPrototype, o(g, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), o(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, u, "GeneratorFunction"), e.isGeneratorFunction = function (t) { var e = "function" == typeof t && t.constructor; return !!e && (e === GeneratorFunction || "GeneratorFunction" === (e.displayName || e.name)); }, e.mark = function (t) { return Object.setPrototypeOf ? Object.setPrototypeOf(t, GeneratorFunctionPrototype) : (t.__proto__ = GeneratorFunctionPrototype, define(t, u, "GeneratorFunction")), t.prototype = Object.create(g), t; }, e.awrap = function (t) { return { __await: t }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, c, function () { return this; }), e.AsyncIterator = AsyncIterator, e.async = function (t, r, n, o, i) { void 0 === i && (i = Promise); var a = new AsyncIterator(wrap(t, r, n, o), i); return e.isGeneratorFunction(r) ? a : a.next().then(function (t) { return t.done ? t.value : a.next(); }); }, defineIteratorMethods(g), define(g, u, "Generator"), define(g, a, function () { return this; }), define(g, "toString", function () { return "[object Generator]"; }), e.keys = function (t) { var e = Object(t), r = []; for (var n in e) r.push(n); return r.reverse(), function next() { for (; r.length;) { var t = r.pop(); if (t in e) return next.value = t, next.done = !1, next; } return next.done = !0, next; }; }, e.values = values, Context.prototype = { constructor: Context, reset: function reset(e) { if (this.prev = 0, this.next = 0, this.sent = this._sent = t, this.done = !1, this.delegate = null, this.method = "next", this.arg = t, this.tryEntries.forEach(resetTryEntry), !e) for (var r in this) "t" === r.charAt(0) && n.call(this, r) && !isNaN(+r.slice(1)) && (this[r] = t); }, stop: function stop() { this.done = !0; var t = this.tryEntries[0].completion; if ("throw" === t.type) throw t.arg; return this.rval; }, dispatchException: function dispatchException(e) { if (this.done) throw e; var r = this; function handle(n, o) { return a.type = "throw", a.arg = e, r.next = n, o && (r.method = "next", r.arg = t), !!o; } for (var o = this.tryEntries.length - 1; o >= 0; --o) { var i = this.tryEntries[o], a = i.completion; if ("root" === i.tryLoc) return handle("end"); if (i.tryLoc <= this.prev) { var c = n.call(i, "catchLoc"), u = n.call(i, "finallyLoc"); if (c && u) { if (this.prev < i.catchLoc) return handle(i.catchLoc, !0); if (this.prev < i.finallyLoc) return handle(i.finallyLoc); } else if (c) { if (this.prev < i.catchLoc) return handle(i.catchLoc, !0); } else { if (!u) throw new Error("try statement without catch or finally"); if (this.prev < i.finallyLoc) return handle(i.finallyLoc); } } } }, abrupt: function abrupt(t, e) { for (var r = this.tryEntries.length - 1; r >= 0; --r) { var o = this.tryEntries[r]; if (o.tryLoc <= this.prev && n.call(o, "finallyLoc") && this.prev < o.finallyLoc) { var i = o; break; } } i && ("break" === t || "continue" === t) && i.tryLoc <= e && e <= i.finallyLoc && (i = null); var a = i ? i.completion : {}; return a.type = t, a.arg = e, i ? (this.method = "next", this.next = i.finallyLoc, y) : this.complete(a); }, complete: function complete(t, e) { if ("throw" === t.type) throw t.arg; return "break" === t.type || "continue" === t.type ? this.next = t.arg : "return" === t.type ? (this.rval = this.arg = t.arg, this.method = "return", this.next = "end") : "normal" === t.type && e && (this.next = e), y; }, finish: function finish(t) { for (var e = this.tryEntries.length - 1; e >= 0; --e) { var r = this.tryEntries[e]; if (r.finallyLoc === t) return this.complete(r.completion, r.afterLoc), resetTryEntry(r), y; } }, "catch": function _catch(t) { for (var e = this.tryEntries.length - 1; e >= 0; --e) { var r = this.tryEntries[e]; if (r.tryLoc === t) { var n = r.completion; if ("throw" === n.type) { var o = n.arg; resetTryEntry(r); } return o; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(e, r, n) { return this.delegate = { iterator: values(e), resultName: r, nextLoc: n }, "next" === this.method && (this.arg = t), y; } }, e; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
var _require = require('smartapi-javascript'),
  SmartAPI = _require.SmartAPI;
var totp = require('totp-generator');
var generateSmartSession = exports.generateSmartSession = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2() {
    var cred, smart_api, TOTP;
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          cred = _dataStore["default"].getInstance().getPostData();
          smart_api = new SmartAPI({
            api_key: cred.APIKEY
          });
          TOTP = totp(cred.CLIENT_TOTP_PIN);
          return _context2.abrupt("return", smart_api.generateSession(cred.CLIENT_CODE, cred.CLIENT_PIN, TOTP).then( /*#__PURE__*/function () {
            var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(response) {
              return _regeneratorRuntime().wrap(function _callee$(_context) {
                while (1) switch (_context.prev = _context.next) {
                  case 0:
                    return _context.abrupt("return", (0, _lodash.get)(response, 'data'));
                  case 1:
                  case "end":
                    return _context.stop();
                }
              }, _callee);
            }));
            return function (_x) {
              return _ref2.apply(this, arguments);
            };
          }())["catch"](function (ex) {
            throw ex;
          }));
        case 4:
        case "end":
          return _context2.stop();
      }
    }, _callee2);
  }));
  return function generateSmartSession() {
    return _ref.apply(this, arguments);
  };
}();
var getLtpData = exports.getLtpData = /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(_ref3) {
    var exchange, tradingsymbol, symboltoken, smartInstance, smartApiData, jwtToken, data, cred, config, response;
    return _regeneratorRuntime().wrap(function _callee3$(_context3) {
      while (1) switch (_context3.prev = _context3.next) {
        case 0:
          exchange = _ref3.exchange, tradingsymbol = _ref3.tradingsymbol, symboltoken = _ref3.symboltoken;
          smartInstance = _smartSession["default"].getInstance();
          _context3.next = 4;
          return (0, _functions.delay)({
            milliSeconds: _constants.DELAY
          });
        case 4:
          smartApiData = smartInstance.getPostData();
          jwtToken = (0, _lodash.get)(smartApiData, 'jwtToken');
          data = JSON.stringify({
            exchange: exchange,
            tradingsymbol: tradingsymbol,
            symboltoken: symboltoken
          });
          cred = _dataStore["default"].getInstance().getPostData();
          config = {
            method: 'post',
            url: _constants.GET_LTP_DATA_API,
            headers: {
              Authorization: "Bearer ".concat(jwtToken),
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-UserType': 'USER',
              'X-SourceID': 'WEB',
              'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
              'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
              'X-MACAddress': 'MAC_ADDRESS',
              'X-PrivateKey': cred.APIKEY
            },
            data: data
          };
          _context3.prev = 9;
          _context3.next = 12;
          return (0, _axios["default"])(config);
        case 12:
          response = _context3.sent;
          return _context3.abrupt("return", (0, _lodash.get)(response, 'data.data', {}) || {});
        case 16:
          _context3.prev = 16;
          _context3.t0 = _context3["catch"](9);
          throw _context3.t0;
        case 19:
        case "end":
          return _context3.stop();
      }
    }, _callee3, null, [[9, 16]]);
  }));
  return function getLtpData(_x2) {
    return _ref4.apply(this, arguments);
  };
}();
var getPositions = exports.getPositions = /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4() {
    var smartInstance, smartApiData, jwtToken, cred, config;
    return _regeneratorRuntime().wrap(function _callee4$(_context4) {
      while (1) switch (_context4.prev = _context4.next) {
        case 0:
          _context4.next = 2;
          return (0, _functions.delay)({
            milliSeconds: _constants.DELAY
          });
        case 2:
          smartInstance = _smartSession["default"].getInstance();
          _context4.next = 5;
          return (0, _functions.delay)({
            milliSeconds: _constants.DELAY
          });
        case 5:
          smartApiData = smartInstance.getPostData();
          jwtToken = (0, _lodash.get)(smartApiData, 'jwtToken');
          cred = _dataStore["default"].getInstance().getPostData();
          config = {
            method: 'get',
            url: _constants.GET_POSITIONS,
            headers: {
              Authorization: "Bearer ".concat(jwtToken),
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-UserType': 'USER',
              'X-SourceID': 'WEB',
              'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
              'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
              'X-MACAddress': 'MAC_ADDRESS',
              'X-PrivateKey': cred.APIKEY
            },
            data: ''
          };
          return _context4.abrupt("return", (0, _axios["default"])(config).then(function (response) {
            return (0, _lodash.get)(response, 'data');
          })["catch"](function (error) {
            var errorMessage = "".concat(_constants.ALGO, ": getPositions failed error below");
            throw error;
          }));
        case 10:
        case "end":
          return _context4.stop();
      }
    }, _callee4);
  }));
  return function getPositions() {
    return _ref5.apply(this, arguments);
  };
}();
var doOrder = exports.doOrder = /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(_ref6) {
    var tradingsymbol, transactionType, symboltoken, _ref6$productType, productType, qty, smartInstance, smartApiData, jwtToken, data, cred, config;
    return _regeneratorRuntime().wrap(function _callee5$(_context5) {
      while (1) switch (_context5.prev = _context5.next) {
        case 0:
          tradingsymbol = _ref6.tradingsymbol, transactionType = _ref6.transactionType, symboltoken = _ref6.symboltoken, _ref6$productType = _ref6.productType, productType = _ref6$productType === void 0 ? 'CARRYFORWARD' : _ref6$productType, qty = _ref6.qty;
          smartInstance = _smartSession["default"].getInstance();
          _context5.next = 4;
          return (0, _functions.delay)({
            milliSeconds: _constants.DELAY
          });
        case 4:
          smartApiData = smartInstance.getPostData();
          jwtToken = (0, _lodash.get)(smartApiData, 'jwtToken');
          data = JSON.stringify({
            exchange: 'NFO',
            tradingsymbol: tradingsymbol,
            symboltoken: symboltoken,
            quantity: qty,
            disclosedquantity: qty,
            transactiontype: transactionType,
            ordertype: 'MARKET',
            variety: 'NORMAL',
            producttype: productType,
            duration: 'DAY'
          });
          cred = _dataStore["default"].getInstance().getPostData();
          config = {
            method: 'post',
            url: _constants.ORDER_API,
            headers: {
              Authorization: "Bearer ".concat(jwtToken),
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-UserType': 'USER',
              'X-SourceID': 'WEB',
              'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
              'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
              'X-MACAddress': 'MAC_ADDRESS',
              'X-PrivateKey': cred.APIKEY
            },
            data: data
          };
          return _context5.abrupt("return", (0, _axios["default"])(config).then(function (response) {
            return (0, _lodash.get)(response, 'data');
          })["catch"](function (error) {
            var errorMessage = "".concat(_constants.ALGO, ": doOrder failed error below");
            throw error;
          }));
        case 10:
        case "end":
          return _context5.stop();
      }
    }, _callee5);
  }));
  return function doOrder(_x3) {
    return _ref7.apply(this, arguments);
  };
}();
var fetchData = exports.fetchData = /*#__PURE__*/function () {
  var _ref8 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6() {
    return _regeneratorRuntime().wrap(function _callee6$(_context6) {
      while (1) switch (_context6.prev = _context6.next) {
        case 0:
          _context6.next = 2;
          return _axios["default"].get(_constants.SCRIPMASTER).then(function (response) {
            var acData = (0, _lodash.get)(response, 'data', []) || [];
            var scripMaster = acData.map(function (element, index) {
              return _objectSpread(_objectSpread({}, element), {}, {
                label: (0, _lodash.get)(element, 'name', 'NONAME') || 'NONAME',
                key: '0' + index + (0, _lodash.get)(element, 'token', '00') || '00'
              });
            });
            return scripMaster;
          })["catch"](function (evt) {
            throw evt;
          });
        case 2:
          return _context6.abrupt("return", _context6.sent);
        case 3:
        case "end":
          return _context6.stop();
      }
    }, _callee6);
  }));
  return function fetchData() {
    return _ref8.apply(this, arguments);
  };
}();
var getStock = exports.getStock = /*#__PURE__*/function () {
  var _ref10 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(_ref9) {
    var scriptName, scripMaster, filteredScrip, errorMessage;
    return _regeneratorRuntime().wrap(function _callee7$(_context7) {
      while (1) switch (_context7.prev = _context7.next) {
        case 0:
          scriptName = _ref9.scriptName;
          _context7.next = 3;
          return fetchData();
        case 3:
          scripMaster = _context7.sent;
          if (!(scriptName && (0, _lodash.isArray)(scripMaster) && scripMaster.length > 0)) {
            _context7.next = 13;
            break;
          }
          filteredScrip = scripMaster.filter(function (scrip) {
            var _scripName = (0, _lodash.get)(scrip, 'symbol', '') || '';
            return _scripName === scriptName.concat('-EQ') && (0, _lodash.get)(scrip, 'exch_seg') === 'NSE';
          }); //console.log('filteredScrip: ', filteredScrip);
          if (!(filteredScrip.length === 1)) {
            _context7.next = 10;
            break;
          }
          return _context7.abrupt("return", filteredScrip[0]);
        case 10:
          throw new Error('stock not found');
        case 11:
          _context7.next = 15;
          break;
        case 13:
          errorMessage = "".concat(_constants.ALGO, ": getStock failed");
          throw errorMessage;
        case 15:
        case "end":
          return _context7.stop();
      }
    }, _callee7);
  }));
  return function getStock(_x4) {
    return _ref10.apply(this, arguments);
  };
}();
var getOption = exports.getOption = /*#__PURE__*/function () {
  var _ref12 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8(_ref11) {
    var scriptName, strikePrice, optionType, expiryDate, scripMaster, scrips, errorMessage;
    return _regeneratorRuntime().wrap(function _callee8$(_context8) {
      while (1) switch (_context8.prev = _context8.next) {
        case 0:
          scriptName = _ref11.scriptName, strikePrice = _ref11.strikePrice, optionType = _ref11.optionType, expiryDate = _ref11.expiryDate;
          _context8.next = 3;
          return fetchData();
        case 3:
          scripMaster = _context8.sent;
          if (!(scriptName && (0, _lodash.isArray)(scripMaster) && scripMaster.length > 0)) {
            _context8.next = 11;
            break;
          }
          scrips = scripMaster.filter(function (scrip) {
            var _scripName = (0, _lodash.get)(scrip, 'name', '') || '';
            var _symbol = (0, _lodash.get)(scrip, 'symbol', '') || '';
            var _expiry = (0, _lodash.get)(scrip, 'expiry', '') || '';
            return (_scripName.includes(scriptName) || _scripName === scriptName) && (0, _lodash.get)(scrip, 'exch_seg') === 'NFO' && (0, _lodash.get)(scrip, 'instrumenttype') === 'OPTSTK' && (strikePrice === undefined || _symbol.includes(strikePrice)) && (optionType === undefined || _symbol.includes(optionType)) && _expiry === expiryDate;
          });
          scrips.sort(function (curr, next) {
            return (0, _lodash.get)(curr, 'token', 0) - (0, _lodash.get)(next, 'token', 0);
          });
          scrips = scrips.map(function (element, index) {
            return {
              exch_seg: (0, _lodash.get)(element, 'exch_seg', '') || '',
              expiry: (0, _lodash.get)(element, 'expiry', '') || '',
              instrumenttype: (0, _lodash.get)(element, 'instrumenttype', '') || '',
              lotsize: (0, _lodash.get)(element, 'lotsize', '') || '',
              name: (0, _lodash.get)(element, 'name', '') || '',
              strike: (0, _lodash.get)(element, 'strike', '') || '',
              symbol: (0, _lodash.get)(element, 'symbol', '') || '',
              tick_size: (0, _lodash.get)(element, 'tick_size', '') || '',
              token: (0, _lodash.get)(element, 'token', '') || '',
              label: (0, _lodash.get)(element, 'name', 'NoName') || 'NoName',
              key: index.toString()
            };
          });
          return _context8.abrupt("return", scrips);
        case 11:
          errorMessage = "".concat(_constants.ALGO, ": getScrip failed");
          throw errorMessage;
        case 13:
        case "end":
          return _context8.stop();
      }
    }, _callee8);
  }));
  return function getOption(_x5) {
    return _ref12.apply(this, arguments);
  };
}();
var takeOrbTrade = /*#__PURE__*/function () {
  var _ref14 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(_ref13) {
    var _get;
    var scrip, tradeDirection, price, positionsResponse, positionsData, position, scripData, atm, getPeScrip, _doOrderResponse, getCeScrip, _doOrderResponse2;
    return _regeneratorRuntime().wrap(function _callee9$(_context9) {
      while (1) switch (_context9.prev = _context9.next) {
        case 0:
          scrip = _ref13.scrip, tradeDirection = _ref13.tradeDirection, price = _ref13.price;
          _context9.next = 3;
          return getPositions();
        case 3:
          positionsResponse = _context9.sent;
          positionsData = (_get = (0, _lodash.get)(positionsResponse, 'data', [])) !== null && _get !== void 0 ? _get : [];
          if (!(Array.isArray(positionsData) && positionsData.length > 0)) {
            _context9.next = 32;
            break;
          }
          position = positionsData.filter(function (position) {
            if ((0, _lodash.get)(position, 'name') === scrip.name) return position;
          });
          if (!(position.length === 0)) {
            _context9.next = 32;
            break;
          }
          _context9.next = 10;
          return getLtpData({
            exchange: scrip.exch_seg,
            symboltoken: scrip.token,
            tradingsymbol: scrip.symbol
          });
        case 10:
          scripData = _context9.sent;
          _context9.next = 13;
          return (0, _functions.getAtmStrikePrice)({
            scrip: scrip,
            ltp: scripData.ltp
          });
        case 13:
          atm = _context9.sent;
          if (!(tradeDirection === 'up' && scripData.ltp > price)) {
            _context9.next = 24;
            break;
          }
          _context9.next = 17;
          return getOption({
            scriptName: scrip.name,
            strikePrice: atm.toString(),
            optionType: 'PE',
            expiryDate: (0, _functions.getLastThursdayOfCurrentMonth)()
          });
        case 17:
          getPeScrip = _context9.sent;
          if (!(getPeScrip.length === 1)) {
            _context9.next = 22;
            break;
          }
          _context9.next = 21;
          return doOrder({
            tradingsymbol: (0, _lodash.get)(getPeScrip[0], 'symbol', '') || '',
            symboltoken: (0, _lodash.get)(getPeScrip[0], 'token', '') || '',
            qty: (0, _functions.getLotSize)({
              scrip: getPeScrip[0]
            }),
            transactionType: _constants.TRANSACTION_TYPE_SELL,
            productType: 'INTRADAY'
          });
        case 21:
          _doOrderResponse = _context9.sent;
        case 22:
          _context9.next = 32;
          break;
        case 24:
          if (!(tradeDirection === 'down' && scripData.ltp < price)) {
            _context9.next = 32;
            break;
          }
          _context9.next = 27;
          return getOption({
            scriptName: scrip.name,
            strikePrice: atm.toString(),
            optionType: 'CE',
            expiryDate: (0, _functions.getLastThursdayOfCurrentMonth)()
          });
        case 27:
          getCeScrip = _context9.sent;
          if (!(getCeScrip.length === 1)) {
            _context9.next = 32;
            break;
          }
          _context9.next = 31;
          return doOrder({
            tradingsymbol: (0, _lodash.get)(getCeScrip[0], 'symbol', '') || '',
            symboltoken: (0, _lodash.get)(getCeScrip[0], 'token', '') || '',
            qty: (0, _functions.getLotSize)({
              scrip: getCeScrip[0]
            }),
            transactionType: _constants.TRANSACTION_TYPE_SELL,
            productType: 'INTRADAY'
          });
        case 31:
          _doOrderResponse2 = _context9.sent;
        case 32:
        case "end":
          return _context9.stop();
      }
    }, _callee9);
  }));
  return function takeOrbTrade(_x6) {
    return _ref14.apply(this, arguments);
  };
}();
var getMtm = /*#__PURE__*/function () {
  var _ref16 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10(_ref15) {
    var _get2;
    var scrip, positionsResponse, positionsData, mtm, _get3, position;
    return _regeneratorRuntime().wrap(function _callee10$(_context10) {
      while (1) switch (_context10.prev = _context10.next) {
        case 0:
          scrip = _ref15.scrip;
          _context10.next = 3;
          return getPositions();
        case 3:
          positionsResponse = _context10.sent;
          positionsData = (_get2 = (0, _lodash.get)(positionsResponse, 'data', [])) !== null && _get2 !== void 0 ? _get2 : [];
          mtm = 0;
          if (Array.isArray(positionsData) && positionsData.length > 0) {
            position = positionsData.filter(function (position) {
              var tradingSymbol = (0, _lodash.get)(position, 'tradingsymbol');
              if (tradingSymbol === scrip.symbol) return position;
            });
            mtm = parseInt((_get3 = (0, _lodash.get)(position, 'unrealised', '0')) !== null && _get3 !== void 0 ? _get3 : '0');
          }
          return _context10.abrupt("return", mtm);
        case 8:
        case "end":
          return _context10.stop();
      }
    }, _callee10);
  }));
  return function getMtm(_x7) {
    return _ref16.apply(this, arguments);
  };
}();
var checkSL = /*#__PURE__*/function () {
  var _ref18 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee11(_ref17) {
    var maxSl, trailSl, tradeDirection, scrip, mtm, updatedMaxSl;
    return _regeneratorRuntime().wrap(function _callee11$(_context11) {
      while (1) switch (_context11.prev = _context11.next) {
        case 0:
          maxSl = _ref17.maxSl, trailSl = _ref17.trailSl, tradeDirection = _ref17.tradeDirection, scrip = _ref17.scrip;
          _context11.next = 3;
          return getMtm({
            scrip: scrip
          });
        case 3:
          mtm = _context11.sent;
          updatedMaxSl = (0, _functions.updateMaxSl)({
            mtm: mtm,
            maxSl: maxSl,
            trailSl: trailSl
          });
          if (!(Math.abs(mtm) > updatedMaxSl)) {
            _context11.next = 13;
            break;
          }
          if (!(tradeDirection === 'up')) {
            _context11.next = 11;
            break;
          }
          _context11.next = 9;
          return doOrder({
            tradingsymbol: scrip.symbol,
            symboltoken: scrip.token,
            transactionType: _constants.TRANSACTION_TYPE_SELL,
            qty: (0, _functions.getLotSize)({
              scrip: scrip
            }),
            productType: 'INTRADAY'
          });
        case 9:
          _context11.next = 13;
          break;
        case 11:
          _context11.next = 13;
          return doOrder({
            tradingsymbol: scrip.symbol,
            symboltoken: scrip.token,
            transactionType: _constants.TRANSACTION_TYPE_BUY,
            qty: (0, _functions.getLotSize)({
              scrip: scrip
            }),
            productType: 'INTRADAY'
          });
        case 13:
        case "end":
          return _context11.stop();
      }
    }, _callee11);
  }));
  return function checkSL(_x8) {
    return _ref18.apply(this, arguments);
  };
}();
var runOrb = exports.runOrb = /*#__PURE__*/function () {
  var _ref20 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee12(_ref19) {
    var scriptName, price, maxSl, tradeDirection, trailSl, scrip, mtm;
    return _regeneratorRuntime().wrap(function _callee12$(_context12) {
      while (1) switch (_context12.prev = _context12.next) {
        case 0:
          scriptName = _ref19.scriptName, price = _ref19.price, maxSl = _ref19.maxSl, tradeDirection = _ref19.tradeDirection, trailSl = _ref19.trailSl;
          _context12.next = 3;
          return getStock({
            scriptName: scriptName
          });
        case 3:
          scrip = _context12.sent;
          _context12.next = 6;
          return takeOrbTrade({
            price: price,
            scrip: scrip,
            tradeDirection: tradeDirection
          });
        case 6:
          mtm = getMtm({
            scrip: scrip
          }); // await checkSL({ maxSl, trailSl, tradeDirection, scrip });
          return _context12.abrupt("return", {
            mtm: mtm
          });
        case 8:
        case "end":
          return _context12.stop();
      }
    }, _callee12);
  }));
  return function runOrb(_x9) {
    return _ref20.apply(this, arguments);
  };
}();
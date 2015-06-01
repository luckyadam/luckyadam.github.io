/*!
 * A module loader
 */

(function (global) {
  'use strict';
  var PP = {
    version: '0.0.1'
  };

  var config = {
    baseUrl: undefined
  };

  // 一些简单方法
  var Util = {

    /** 模拟数组的遍历方法 */
    forEach: function (arg, fn) {
      var type = Object.prototype.toString.call(arg);
      if (type === '[object Array]') {
        for (var i = 0; i < arg.length; i++) {
          if (fn.call(arg[i], arg[i], i) === false) {
            return;
          }
        }
      } else if (type === '[object Object]') {
        for (var i in arg) {
          if (arg.hasOwnProperty(i)) {
            if (fn.call(arg[i], arg[i], i) === false) {
              return;
            }
          }
        }
      }
    }
  };

  // 模块相关数据池
  var ModulesDataPool = {
    // 已经下载完成的js文件
    loadedPaths: {},
    // 模块实例的缓存
    cache: {},
    // 标记对应路径模块加载状态
    loadingPaths: {},
    // 标记模块初始化状态
    initingModules: {},
    // 异步模块列表
    requiredPaths: {},
    // 暂时缓存需要加载的模块
    lazyLoadPaths: {}
  };

  /**
   * 模块类
   * @constructor
   * @param {string} path - 文件全路径.
   * @param {string} name - 模块名.
   */
  function Module (path, name) {
    this.name = name;
    this.path = path;

    // 模块包装的方法
    this.fn = null;
    // 模块暴露对象
    this.exports = {};

    // 模块（包括依赖）是否全部加载完成
    this._loaded = false;
    // 完成后需要触发的方法
    this._readyStack = [];

    // 实例化之后将当前模块实例添加到缓存中
    ModulesDataPool.cache[this.name] = this;
  }

  /** @lends Module */
  Module.prototype = {

    /**
     * @description 初始化模块，执行模块的方法
     */
    init: function () {
      if (!this._inited) {
        this._inited = true;
        if (!this.fn) {
          throw new Error('Module ' + this.name + ' not found!');
        }
        var result = null;
        ModulesDataPool.initingModules[this.name] = true;

        // 执行方法，传入参数有require
        if (result = this.fn.call(null, require, this.exports, this)) {
          this.exports = result;
        }

        ModulesDataPool.initingModules[this.name] = false;
      }
    },

    /**
     * @description 加载模块
     */
    load: function () {
      var path = this.path;
      ModulesDataPool.loadingPaths[path] = true;
      Script.load({
        src: path
      });
    },

    /**
     * @description 模块加载完成
     */
    ready: function (fn) {
      var stack = this._readyStack;
      if (this._loaded) {
        this.init();
        fn();
      } else {
        stack.push(fn);
      }
    },

    /**
     * @description 触发方法栈的执行
     */
    triggerStack: function () {
      if (this._readyStack.length > 0) {
        this.init();
        Util.forEach(this._readyStack, function (func) {
          if (!func.excuting) {
            func.excuting = true;
            func();
          }
        });

        this._readyStack = [];
      }
    },

    /**
     * @description 标记模块加载完成，并执行相关初始化操作
     */
    define: function (){
      this._loaded = true;
      ModulesDataPool.loadedPaths[this.path] = true;
      delete ModulesDataPool.loadingPaths[this.path];
      this.triggerStack();
    },

    /**
     * @description 延后加载模块
     */
    lazyLoad: function () {
      var name = this.name;
      var path = this.path;

      if (ModulesDataPool.lazyLoadPaths[name]) {
        this.define();
        delete ModulesDataPool.lazyLoadPaths[name];
      } else {
        if (ModulesDataPool.loadedPaths[path]) {
          this.triggerStack();
        } else {
          ModulesDataPool.requiredPaths[this.name] = true;
          this.load();
        }
      }
    }

  };

  /**
   * @description 定义require方法
   */
  function require(name) {
    var mod = getModule(name);
    if (!ModulesDataPool.initingModules[name]) {
      mod.init();
    }

    return mod.exports;
  }

  /**
   * @description 检查给定路径数组的路径是否都已加载完成
   */
  function checkPathsLoaded(paths) {
    for (var i = 0; i < paths.length; i++) {
      if (!(paths[i] in ModulesDataPool.loadedPaths)) {
        return false;
      }
    }

    return true;
  }

  /**
   * @description 通过名称获取对应路径
   */
  function getPathByName (name) {
    return config.baseUrl ? (config.baseUrl) + name : name;
  }

  /**
   * @description 通过名称或路径获取模块
   */
  function getModule(name) {
    var path = name.indexOf(':') > -1 ? path : getPathByName(name);
    if (ModulesDataPool.cache[name]) {
      return ModulesDataPool.cache[name];
    }

    return new Module(path, name);
  }

  // 脚本加载器
  var Script = {
    // 缓存已经加载过的路径
    _paths: {},

    // 路径规则的配置
    _rules: [],
    load: function (opt) {
      if (opt.src in this._paths) {
        return;
      }

      this._paths[opt.src] = true;
      Util.forEach(this._rules, function (modify) {
        modify.call(null, opt);
      });

      var head = document.getElementsByTagName('head')[0];
      var node = document.createElement('script');
      node.type = opt.type || 'text/javascript';
      if (opt.charset) {
        node.charset = opt.charset;
      }
      node.src = opt.src;
      node.onload = node.onerror = node.onreadystatechange = function () {
        if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
          // 确保这些方法只执行一次
          node.onload = node.onerror = node.onreadystatechange = null;
          // 加载完js后会立即初始化模块，并将结果装载到内存中
          // 所以可以将script标签移除
          if (node.parentNode) {
            head.removeChild(node);
          }
          node = undefined;
          opt.loaded && opt.loaded();
        }
      };
      head.insertBefore(node, head.firstChild);
    },

    // 增加路径规则
    addPathRule: function (modify) {
      if (modify) {
        this._rules.push(modify);
      }
    }
  };

  // 创建模块
  PP.define = function (name, fn) {
    var mod = getModule(name);
    mod.fn = fn;
    if (ModulesDataPool.requiredPaths[name]) {
      mod.define();
    } else {
      ModulesDataPool.lazyLoadPaths[name] = true;
    }
  };

  // 指定一个或多个模块名，待模块加载完成后执行回调方法，并将模块对象按照次序作为参数一次传递
  PP.use = function (names, fn) {
    if (typeof names === 'string') {
      names = [names];
    }

    var args = [];
    var flags = [];

    Util.forEach(names, function (name, i) {
      flags[i] = false;
    });

    Util.forEach(names, function (name, i) {
      var mod = getModule(name);
      mod.ready(function () {
        args[i] = mod.exports;
        flags[i] = true;
        var done = true;
        Util.forEach(flags, function (flag) {
          if (flag === false) {
            return done = false;
          }
        });
        if (fn && done) {
          fn.apply(null, args);
        }
      });
      mod.lazyLoad();
    });
  };

  // 异步加载模块
  require.async = PP.use;

  // 全局的require
  PP.require = require;

  // 暴露增加路径规则配置的方法
  PP.addPathRule = function (modify) {
    Script.addPathRule(modify);
  };

  // 配置baseUrl
  PP.config = function (option) {
    var baseUrl = option['baseUrl'];
    if (typeof baseUrl === 'string') {
      if (baseUrl && baseUrl.charAt(baseUrl.length - 1) === '/') {
        baseUrl = baseUrl.substr(0, baseUrl.length - 1);
      }
      config.baseUrl = baseUrl;
    }
  };

  'PP' in global || (global.PP = PP);
})(window, undefined);

/*!
 * A class factory
 */

(function (global) {
  'use strict';
  var _ = global._ || (global._ = { });
  function type (arg) {
    var class2type = {};
    var toString = class2type.toString;
    var types = 'Boolean Number String Function Array Date RegExp Object Error'.split(' ');
    for (var i = 0; i < types.length; i++) {
      var typeItem = types[i];
      class2type['[object ' + typeItem + ']'] = typeItem.toLowerCase();
    }

    if (arg === null) {
      return arg + '';
    }

    return (typeof arg === 'object' || typeof arg === 'function') ?
      class2type[toString.call(arg)] || 'object' :
      typeof arg;
  }

  function isFunction (arg) {
    return type(arg) === 'function';
  };

  var initializing = false;
  // 目的是为了检测Function.prototype.toString能否打印出函数内部信息
  var fnTest = /xyz/.test(function() {xyz;}) ? /\bsuper\b/ : /.*/;
  _.Class = function () {};

  _.Class.extend = function class_extend (properties) {
    var _super = this.prototype;

    initializing = true;
    var subPrototype = new this();
    initializing = false;
    for (var prop in properties) {
      if (prop === 'statics') {
        var staticObj = properties[prop];
        for (var staticProp in staticObj) {
          Klass[staticProp] = staticObj[staticProp];
        }
      } else {
        if (isFunction(_super[prop])
          && isFunction(properties[prop])
          && fnTest.test(properties[prop])) {
          subPrototype[prop] = (function (prop, fn) {
            return function () {
              this.super = _super[prop];
              return fn.apply(this, arguments);
            };
          })(prop, properties[prop]);
        } else {
          subPrototype[prop] = properties[prop];
        }
      }
    }

    function Klass () {
      if (!initializing && isFunction(this['construct'])) {
        this.construct.apply(this, arguments);
      }
    }

    Klass.prototype = subPrototype;

    Klass.prototype.constructor = Klass;

    Klass.extend = class_extend;

    return Klass;

  };

})(window, undefined);

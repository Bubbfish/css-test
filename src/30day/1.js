import store from '@/store'
import htmlParser from 'html-parser'
const toStr = Object.prototype.toString
const _hasOwn = Object.prototype.hasOwnProperty
const _slice = Array.prototype.slice

function noop() {}

// 获取url参数
export function getQueryString(name) {
  let reg = new RegExp('(\\W+)' + name + '=(.*?)(\\W|$)', 'i')
  let r = window.location.href.match(reg)
  if (r != null) {
    return unescape(r[2])
  }
  return null
}

// 展开树形结构数据
export function expandTreeData(tree, res) {
  let result = res || []
  if (Array.isArray(tree) && tree.length) {
    tree.forEach(item => {
      result.push(item)
      if (item.children) {
        expandTreeData(item.children, result)
      }
    })
  }
  return result
}

// 避免频繁输入导致的频繁请求
export function debounce(func, delay) {
  let timer
  return function(...args) {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      func.apply(this, args)
    }, delay)
  }
}

/**
 * 缓冲池控制，解决频繁操作
 *
 * @param {Number} controlTime 缓冲的时间 默认 200ms
 * @function run 执行缓冲控制 第一个参数为执行函数，第二个为自定义参数，当缓冲结束后返回参数为期间所有传递参数的数组集合
 */
export function BufferControl(controlTime = 200) {
  this.timer = null
  this.buffer = new Set() // 缓冲池
  this.run = function(fn, value) {
    if (value) {
      this.buffer.add(value)
    }
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    let args = Array.from(this.buffer)
    this.timer = setTimeout(() => {
      fn.call(this, args)
      this.clear()
    }, controlTime)
  }
  this.clear = function() {
    this.buffer.clear()
    this.timer = null
  }
  this.destory = function() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    this.clear()
  }
}

/**
 * 平滑滚动
 *
 * @param {DOM} el 需要滚动的元素
 * @param {number} [from=0] 起始位置
 * @param {number} to 结束位置
 * @param {number} [duration=500] 持续时长
 * @param {*} callback 回调函数
 */
export function scrollTo(el, from = 0, to, duration = 500, callback) {
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame =
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback) {
        return window.setTimeout(callback, 1000 / 60)
      }
  }
  const difference = Math.abs(from - to)
  const step = Math.ceil((difference / duration) * 50)

  function scroll(start, end, step) {
    if (start === end) {
      typeof callback === 'function' && callback()
      return
    }

    let d = start + step > end ? end : start + step
    if (start > end) {
      d = start - step < end ? end : start - step
    }

    if (el === window) {
      window.scrollTo(d, d)
    } else {
      el.scrollTop = d
    }
    window.requestAnimationFrame(() => scroll(d, end, step))
  }

  scroll(from, to, step)
}

export function trim(string) {
  if (isNullOrUndefinedOrEmpty(string)) {
    string = ''
  } else {
    string = String(string).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '')
  }
  return string
}

export function isNullOrUndefined(o) {
  return o === void 0 || o === null || typeof o === 'unknown' // eslint-disable-line
}

export function isNullOrUndefinedOrEmpty(o) {
  return isNullOrUndefined(o) || o === ''
}

export function isString(o) {
  return o instanceof String || typeof o === 'string'
}

export function isArray(o) {
  if (isFunction(Array.isArray)) return Array.isArray(o)
  return toStr.call(o) === '[object Array]'
}

/**
 * 判断变量值是否为对象
 * @param {*} o 需要进行对象判断的变量值
 * @returns {Boolean}
 */
export function isObject(o) {
  return o !== null && o instanceof Object
}

export function isFunction(fn) {
  return typeof fn === 'function'
}

/**
 * 将字符串转换为驼峰式
 * @param {String} str
 * @returns {String}
 */
export function getCamelCase(str) {
  if (str && isString(str) && ('' + str).indexOf('-') > -1) {
    str = ('' + str).replace(/-([a-zA-Z])/g, function($, $1) {
      return $1.toUpperCase()
    })
  }
  return str
}

/**
 * 将字符串转换为中短横线隔断的字符串
 * @param {String} str
 * @returns {String}
 */
export function getKebabCase(str) {
  if (str && isString(str) && ('' + str).length > 1) {
    str = '' + str
    str =
      str[0] +
      str.substring(1).replace(/[A-Z]/g, function(m) {
        return '-' + m.toLowerCase()
      })
  }
  return str
}

export function forEach(a, callback) {
  /* eslint-disable semi, one-var */
  const isA = isArray(a)
  if (isA && isFunction(Array.prototype.forEach)) {
    a.forEach(function(item) {
      return callback.apply(item, _slice.call(arguments))
    })
  } else {
    if (isA) {
      for (let i = 0, length = a.length; i < length; i++) {
        callback(a[i], i, a)
      }
    } else if (isObject(a)) {
      for (let key in a) _hasOwn.call(a, key) && callback(a[key], key, a)
    }
  }
  return a
  /* eslint-enable semi, one-var */
}

export function some(a, callback) {
  /* eslint-disable semi, one-var */
  let b = false
  if (!isNullOrUndefinedOrEmpty(a)) {
    const _isArray = isArray(a)
    if (_isArray && isFunction(Array.prototype.some)) return a.some(callback)
    if (_isArray) {
      for (let i = 0, length = a.length; i < length; i++) {
        if (callback(a[i], i, a) === true) {
          b = true
          break
        }
      }
    } else if (isObject(a)) {
      for (let key in a) {
        if (_hasOwn.call(a, key) && callback(a[key], key, a) === true) {
          b = true
          break
        }
      }
    }
  }
  return b
  /* eslint-enable semi, one-var */
}

/**
 * 拷贝对象的指定属性
 * @param {Array/Object} o
 * @param {String/Array(String)/Array(Array(String))} fields: 为['a', 'b', ...]则只复制并返回指定属性组成的对象；
 *   为[['a', 'a1'], ['b', 'b1'], ...]，则复制属性'a','b',...的值，并将key设置为'a1','b1',...
 * @param {Function} fieldFilter: (value, key, obj), 单项过滤条件，返回false则表示不添加
 * @returns {Array/Object}
 */
export function copyFields(o, fields, fieldFilter) {
  /* eslint-disable semi, one-var */
  let ret = {}
  if (isObject(o)) {
    let isA = isArray(o)
    isA && (ret = [])
    !isArray(fields) && (fields = ['' + fields])
    fields = fields.map(function(field) {
      !isArray(field) && (field = [field])
      return field
    })
    !isFunction(fieldFilter) && (fieldFilter = noop)
    forEach(o, function(value, key, o) {
      let targetKey
      key = '' + key
      if (
        fieldFilter(value, key, o) !== false &&
        some(fields, function(field) {
          if (key === '' + field[0]) {
            targetKey = field[1]
            return true
          }
        })
      ) {
        value = o[key]
        if (!isNullOrUndefined(targetKey)) {
          if (isA) {
            let _ret = {}
            forEach(ret, function(v, i) {
              _ret[i] = v
            })
            ret = _ret
            isA = false
          }
          ret['' + targetKey] = value
        } else {
          isA ? ret.push(value) : (ret[key] = value)
        }
      }
    })
  }
  return ret
  /* eslint-enable semi, one-var */
}

/**
 * 将字符串按空格分割成数组
 * @param {String} str
 * @param {Boolean} allowEmpty 是否允许空值项存在，默认不允许
 * @returns {Array}
 */
export function getArrayFromStrSplitByEmpty(str, allowEmpty) {
  str = (!isNullOrUndefinedOrEmpty(str) && String(str).split(' ')) || []
  if (allowEmpty !== true) str = str.filter(item => item !== '')
  return str
}

/**
 * 检测传入的命名控件是否存在
 * @param {String} namespace
 * @param {Object} context 检测的上下文
 * @param {Function} callback (exists, context, namespace)
 * @returns {object} { exists, context }
 */
export function checkNamespace(namespace, context, callback) {
  /* eslint-disable semi, one-var, no-eval */
  var exists = false
  if (namespace) {
    if (!context) context = (0, eval)('this')
    namespace = namespace.split('.')
    exists = !some(namespace, function(name) {
      var index = name.match(/\[(\d+)]$/),
        ok = false
      if (index) {
        name = name.substring(0, name.length - index[0].length)
        index = index[1]
      }
      if (!isNullOrUndefined(context) && context[name]) {
        context = context[name]
        ok = true
        if (index) {
          ok = false
          if (index in context) {
            context = context[index]
            ok = true
          }
        }
      }
      return !ok
    })
  }
  if (isFunction(callback)) callback(exists, context, namespace)
  return { exists: exists, context: context }
  /* eslint-enable semi, one-var, no-eval */
}

export function parseInnerText(str) {
  if (!str || typeof str !== 'string') {
    return str
  }
  let label = ''
  htmlParser.parse(str, {
    text: val => {
      if (label.length) {
        label += '\n'
      }
      label += val
    }
  })
  return label
}

// HTML标签转义
export function escapeHTML(a) {
  a = '' + a
  return a
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// HTML标签反转义
export function unescapeHTML(a) {
  a = '' + a
  return a
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
/**
 * 生成随机字符串
 *
 * @export
 * @param {Number} length 字符串长度
 */
export function getRandomString(length) {
  let i
  let text = []
  let possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  length = Number(length) ? Number(length) : 10

  for (i = 0; i < length; i++) {
    text.push(possible.charAt(Math.floor(Math.random() * possible.length)))
  }

  return text.join('')
}

// 传入两个数组，返回数组中不同的部分
export function getDifferArray(array1, array2) {
  let exist = array1 && array2
  if (exist && Array.isArray(array1) && Array.isArray(array2)) {
    let result = []
    for (let i = 0; i < array1.length; i++) {
      let item1 = array1[i]
      let isExist = false
      for (let j = 0; j < array2.length; j++) {
        let item2 = array2[j]
        if (item2 === item1) {
          isExist = true
          break
        }
      }
      if (!isExist) {
        result.push(item1)
      }
    }
    return result
  }
}

// 深度拷贝数组和对象
export function deepCopy(source) {
  if (!source) {
    return source
  }
  let sourceCopy = source instanceof Array ? [] : {}
  for (let item in source) {
    sourceCopy[item] =
      typeof source[item] === 'object' ? deepCopy(source[item]) : source[item]
  }
  return sourceCopy
}

// 首字母大写
export function titleCase(str) {
  return str.substring(0, 1).toUpperCase() + str.substring(1)
}

// 时间戳转斜杆日期
export function stamp2Time(time, toSecond) {
  if (time) {
    let timeString = time.toString()
    let pattern = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/
    if (toSecond) {
      return timeString.replace(pattern, '$1/$2/$3 $4:$5:$6')
    } else {
      return timeString.replace(pattern, '$1/$2/$3 $4:$5')
    }
  }
}

// 获取图片元素在画布的实际宽高
export function getImageSize(width, height) {
  const DIAGRAM_NODE_SIZE = 56
  let scale = width / height
  if (width >= height) {
    if (width > DIAGRAM_NODE_SIZE) {
      width = DIAGRAM_NODE_SIZE
      height = DIAGRAM_NODE_SIZE / scale
    }
  } else {
    if (height > DIAGRAM_NODE_SIZE) {
      height = DIAGRAM_NODE_SIZE
      width = DIAGRAM_NODE_SIZE * scale
    }
  }
  return { width, height }
}

/**
 * 限制大小，超出范围则等比缩小
 * @param {Array(Number)} aOrigSize: [width, height]，原始尺寸
 * @param {Array(Number)} aMaxSize: [width, height]，允许的最大尺寸
 * @returns {Array} [width, height]
 */
export function getScaledSize(aOrigSize, aMaxSize) {
  /* eslint-disable semi */
  const a = aOrigSize
  if (a[0] > aMaxSize[0] || a[1] > aMaxSize[1]) {
    const r = a[0] / a[1]
    if (r > aMaxSize[0] / aMaxSize[1]) {
      a[0] = aMaxSize[0]
      a[1] = a[0] / r
    } else {
      a[1] = aMaxSize[1]
      a[0] = r * a[1]
    }
  }
  return a
  /* eslint-enable semi */
}

/**
 * 将url地址字符串构造成类似window.location的对象
 * @param {String} href
 * @returns {Object} { origin, protocal, host, hostname, port, pathname }
 */
export function Location(href) {
  /* eslint-disable semi, one-var */
  let a = [],
    pathname = '',
    hash = '',
    search = '',
    match,
    index
  const getSearchStrFromArr = a => (a.length ? '?' + a.join('?') : '')
  if (href) {
    if (toStr.call(href) === '[object Location]') return href
    href = '' + href
    match = href.match(
      /^((?:(\w+:))?\/{2}((\w+(?:\.\w+)*)(?::(\d+))?))([/?#].*)$/
    )
    if (match) {
      this.origin = match[1]
      this.protocol = match[2]
      this.host = match[3]
      this.hostname = match[4]
      this.port = match[5]
      this.pathname = match[6]
    } else {
      if (href.indexOf('/') !== 0) {
        pathname = location.pathname
        href = pathname.substring(0, pathname.lastIndexOf('/') + 1) + href
      }
      this.pathname = href
    }
    if (!this.protocol) {
      this.protocol = location.protocol
      this.origin = this.protocol + this.origin
    }
    if (!this.hostname) {
      this.hostname = location.hostname
      this.port = location.port
      this.host = location.host
      this.origin = location.origin || this.protocol + '//' + this.host
    }
    if (this.pathname) {
      a = this.pathname.split('?')
      pathname = a.shift()
      hash = pathname.split('#')
      if (hash.length) {
        pathname = hash.shift()
        search = getSearchStrFromArr(a)
        if (hash.length) {
          hash = hash.join('#') + search
          search = ''
        } else {
          hash = ''
          if (search) {
            hash = search.split('#')
            if (hash.length) {
              search = hash.shift()
              hash = hash.join('#')
            }
          }
        }
      } else {
        search = getSearchStrFromArr(a)
        hash = search.split('#')
        search = hash.shift()
        hash = hash.join('#')
      }
      if (search && search.indexOf('?') !== 0) search = '?' + search
      if (hash && hash.indexOf('#') !== 0) hash = '#' + hash
      this.pathname = pathname
      this.search = search
      this.hash = hash
      if (pathname) {
        index = pathname.lastIndexOf('/')
        if (index > -1) this.path = pathname.substring(0, index + 1)
      }
    }
  }
  if (!this.path) this.path = '/'
  /* eslint-enable semi, one-var */
}

// 是否是PC端
export function isPc() {
  let userAgentInfo = navigator.userAgent
  let Agents = [
    'Android',
    'iPhone',
    'SymbianOS',
    'Windows Phone',
    'iPad',
    'iPod'
  ]
  let flag = true
  for (let v = 0; v < Agents.length; v++) {
    if (userAgentInfo.indexOf(Agents[v]) > 0) {
      flag = false
      break
    }
  }
  return flag
}

export function getPromise() {
  const o = {}
  const promise = new Promise((resolve, reject) => Object.assign(o, { resolve, reject }))
  const keys = Object.keys(o)
  const apply = (key, args) => {
    const fn = o[key]
    if (fn) {
      fn.apply(promise, Array.from(args))
      keys.forEach(key => (o[key] = null))
    }
  }
  const getHandler = key => function () { apply(key, arguments) }
  return Object.assign(promise, keys.reduce((o, key) => {
    o[key] = getHandler(key)
    return o
  }, {}))
}

// 获取hash中的参数
export function getHashParam(param) {
  let reg = new RegExp(`(^|&)${param}=([^&]*)(&|$)`)
  if (window.location.hash.split('?')[1]) {
    let r = window.location.hash.split('?')[1].match(reg)
    if (r !== null) return parseInt(r[2], 10)
  }
}

// 时间戳改时间格式
export function changeTimeFormat(time) {
  let timeDate = new Date(time)
  let year = timeDate.getFullYear() + '-'
  let month =
    (timeDate.getMonth() + 1 < 10
      ? '0' + (timeDate.getMonth() + 1)
      : timeDate.getMonth() + 1) + '-'
  let day = timeDate.getDate() + ' '
  let hour = timeDate.getHours() + ':'
  let minute = timeDate.getMinutes() + ':'
  let second = timeDate.getSeconds()
  return year + month + day + hour + minute + second
}

// 验证代码(允许字母数字下划线中划线井号)
export function validateCode(code) {
  let reg = /^[A-Za-z0-9#_-]+$/ig
  return reg.test(code)
}

export function getCurrentDiagramId() {
  let diagramSheet = store.getters.diagramSheet.find(el => el.active)
  if (diagramSheet) {
    return diagramSheet.diagram.id
  }
}

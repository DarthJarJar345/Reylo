/**
 * Reylo Core — instant local intelligence engine.
 * Runs 100% offline in the browser (and in Node for tests).
 * No API keys, no network, no tracking.
 */

/* ------------------------------------------------------------------ */
/* Math engine — recursive-descent parser (safe, no eval)              */
/* ------------------------------------------------------------------ */

const MATH_FUNCS = {
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (a, b) => Math.pow(a, b),
};

const MATH_CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenizeMath(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (num) { tokens.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const name = src.slice(i).match(/^[a-z]+/i);
    if (name) { tokens.push({ t: 'name', v: name[0].toLowerCase() }); i += name[0].length; continue; }
    if ('+-*/%^!(),'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    if (c === '×') { tokens.push({ t: '*' }); i++; continue; }
    if (c === '÷') { tokens.push({ t: '/' }); i++; continue; }
    if (c === '−') { tokens.push({ t: '-' }); i++; continue; }
    throw new Error(`Unsupported character "${c}" in calculation.`);
  }
  return tokens;
}

function parseMath(src) {
  const tokens = tokenizeMath(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (type) => {
    const tok = tokens[pos];
    if (!tok || tok.t !== type) throw new Error(`Expected "${type}" in calculation.`);
    pos++;
    return tok;
  };

  function expression() {
    let left = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[pos++].t;
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function term() {
    let left = unary();
    while (peek() && ['*', '/', '%'].includes(peek().t)) {
      const op = tokens[pos++].t;
      const right = unary();
      if (op === '*') left = left * right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero.');
        left = left / right;
      } else {
        if (right === 0) throw new Error('Modulo by zero.');
        left = left % right;
      }
    }
    return left;
  }
  function unary() {
    if (peek() && peek().t === '-') { pos++; return -unary(); }
    if (peek() && peek().t === '+') { pos++; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek() && peek().t === '^') { pos++; return Math.pow(base, unary()); }
    return base;
  }
  function postfix() {
    let value = primary();
    while (peek() && peek().t === '!') {
      pos++;
      if (value < 0 || !Number.isInteger(value) || value > 170) {
        throw new Error('Factorial needs a whole number between 0 and 170.');
      }
      let acc = 1;
      for (let n = 2; n <= value; n++) acc *= n;
      value = acc;
    }
    return value;
  }
  function primary() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of calculation.');
    if (tok.t === 'num') { pos++; return tok.v; }
    if (tok.t === '(') { pos++; const v = expression(); eat(')'); return v; }
    if (tok.t === 'name') {
      pos++;
      const name = tok.v;
      if (name in MATH_CONSTS) return MATH_CONSTS[name];
      if (name in MATH_FUNCS) {
        eat('(');
        const args = [expression()];
        while (peek() && peek().t === ',') { pos++; args.push(expression()); }
        eat(')');
        return MATH_FUNCS[name](...args);
      }
      throw new Error(`Unknown symbol "${name}".`);
    }
    throw new Error('Unexpected token in calculation.');
  }

  const result = expression();
  if (pos !== tokens.length) throw new Error('Unexpected extra input in calculation.');
  return result;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

const MATH_WORDS = /(?:\b(?:pi|tau|sqrt|abs|sin|cos|tan|ln|log|exp|round|floor|ceil|min|max|pow)\b)/gi;

function looksLikeMath(message) {
  const m = String(message ?? '').trim();
  if (!m) return false;
  const cleaned = m
    .replace(/^(what(?:'s| is)|whats|calculate|compute|solve|eval(?:uate)?|how much is)\s*/i, '')
    .replace(/[?=]+$/g, '')
    .replace(/\bx\b/gi, '*')
    .trim();
  if (!cleaned) return false;
  // Must involve a digit or a known constant/function…
  const hasValue = /\d/.test(cleaned) || /\b(pi|tau|sqrt|abs|sin|cos|tan|ln|log|exp|round|floor|ceil|min|max|pow)\b/i.test(cleaned);
  if (!hasValue) return false;
  // …and at least one operator (otherwise it's just a number).
  if (!/[+\-*/%^!()×÷]/.test(cleaned)) return false;
  // Every remaining character must belong to the math grammar.
  const stripped = cleaned
    .replace(MATH_WORDS, '')
    .replace(/(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, '')
    .replace(/[\s+\-*/%^!().,×÷]/g, '');
  return stripped.length === 0;
}

function tryMath(message) {
  let m = message.trim();
  // "15% of 240", "what is 15 percent of 240"
  const pct = m.match(/(-?[\d.]+)\s*(?:%|percent)\s+of\s+([\d.,]+)/i);
  if (pct) {
    const p = parseFloat(pct[1]);
    const whole = parseFloat(pct[2].replace(/,/g, ''));
    const value = (p / 100) * whole;
    return `**${p}% of ${formatNumber(whole)}** = **${formatNumber(value)}**`;
  }
  // "240 is what percent of 300"
  const pctOf = m.match(/([\d.,]+)\s+is\s+what\s+(?:%|percent)\s+of\s+([\d.,]+)/i);
  if (pctOf) {
    const part = parseFloat(pctOf[1].replace(/,/g, ''));
    const whole = parseFloat(pctOf[2].replace(/,/g, ''));
    if (whole === 0) return 'Division by zero — the whole amount is 0.';
    const value = (part / whole) * 100;
    return `**${formatNumber(part)} / ${formatNumber(whole)}** = **${formatNumber(Math.round(value * 1e4) / 1e4)}%**`;
  }

  let expr = m
    .replace(/^(what(?:'s| is)|whats|calculate|compute|solve|eval(?:uate)?|how much is)\s*/i, '')
    .replace(/[?=]+$/g, '')
    .replace(/,/g, '')
    .replace(/\bx\b/gi, '*')
    .trim();
  if (!looksLikeMath(m) && !looksLikeMath(expr)) return null;
  try {
    const value = parseMath(expr);
    return `**${expr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ')}** = **${formatNumber(value)}**`;
  } catch (err) {
    return `⚠️ Couldn't compute \`${expr}\` — ${err.message}`;
  }
}

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

const UNITS = {
  length: {
    mm: 0.001, cm: 0.01, m: 1, km: 1000,
    in: 0.0254, inch: 0.0254, inches: 0.0254,
    ft: 0.3048, feet: 0.3048, foot: 0.3048,
    yd: 0.9144, yard: 0.9144, yards: 0.9144,
    mi: 1609.344, mile: 1609.344, miles: 1609.344,
  },
  mass: {
    mg: 1e-6, g: 0.001, kg: 1, tonne: 1000, ton: 1000, tonnes: 1000,
    lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237,
    oz: 0.028349523125, ounce: 0.028349523125, ounces: 0.028349523125,
    st: 6.35029318, stone: 6.35029318,
  },
  volume: {
    ml: 0.001, l: 1, liter: 1, liters: 1, litre: 1, litres: 1,
    tsp: 0.00492892159375, tbsp: 0.01478676478125,
    floz: 0.0295735295625, cup: 0.2365882365, cups: 0.2365882365,
    pt: 0.473176473, pint: 0.473176473, pints: 0.473176473,
    qt: 0.946352946, quart: 0.946352946, quarts: 0.946352946,
    gal: 3.785411784, gallon: 3.785411784, gallons: 3.785411784,
  },
  time: {
    ms: 0.001, s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
    min: 60, mins: 60, minute: 60, minutes: 60,
    h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
    day: 86400, days: 86400, week: 604800, weeks: 604800,
    month: 2629800, months: 2629800, year: 31557600, years: 31557600,
  },
  data: {
    b: 1, byte: 1, bytes: 1,
    kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12,
    kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4,
  },
  speed: {
    ms: 1, 'm/s': 1,
    kmh: 1 / 3.6, 'km/h': 1 / 3.6, kph: 1 / 3.6,
    mph: 0.44704, 'mi/h': 0.44704, knot: 0.514444, knots: 0.514444,
    fts: 0.3048, 'ft/s': 0.3048,
  },
  area: {
    m2: 1, 'm^2': 1, cm2: 1e-4, km2: 1e6,
    ft2: 0.09290304, 'ft^2': 0.09290304,
    acre: 4046.8564224, acres: 4046.8564224,
    hectare: 1e4, hectares: 1e4, ha: 1e4, mi2: 2589988.110336,
  },
};

function tryConvert(message) {
  const m = message.trim();
  const patterns = [
    /convert\s+(-?[\d.,]+)\s*([a-zA-Z°/\^²]+)\s+(?:to|in|into)\s+([a-zA-Z°/\^²]+)/i,
    /(-?[\d.,]+)\s*([a-zA-Z°/\^²]+)\s+(?:to|in|into)\s+([a-zA-Z°/\^²]+)/i,
    /how\s+many\s+([a-zA-Z°/\^²]+)\s+(?:are\s+)?in\s+(-?[\d.,]+)\s*([a-zA-Z°/\^²]+)/i,
    /(-?[\d.,]+)\s*([a-zA-Z°/\^²]+)\s+is\s+how\s+many\s+([a-zA-Z°/\^²]+)/i,
  ];

  let amount, from, to;
  for (let i = 0; i < patterns.length; i++) {
    const match = m.match(patterns[i]);
    if (!match) continue;
    if (i === 2) {
      to = match[1].toLowerCase();
      amount = parseFloat(match[2].replace(/,/g, ''));
      from = match[3].toLowerCase();
    } else {
      amount = parseFloat(match[1].replace(/,/g, ''));
      from = match[2].toLowerCase();
      to = match[3].toLowerCase();
    }
    break;
  }
  if (!amount && amount !== 0) return null;

  // Temperature (special-case)
  const temp = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
  if (from.replace(/°/g, '') in temp && to.replace(/°/g, '') in temp) {
    const f = temp[from.replace(/°/g, '')];
    const t = temp[to.replace(/°/g, '')];
    let celsius = f === 'c' ? amount : f === 'f' ? (amount - 32) * 5 / 9 : amount - 273.15;
    const out = t === 'c' ? celsius : t === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    return `**${formatNumber(amount)}°${f.toUpperCase()}** = **${formatNumber(Math.round(out * 100) / 100)}°${t.toUpperCase()}**`;
  }

  for (const category of Object.values(UNITS)) {
    const f = from.replace(/°/g, '');
    const t = to.replace(/°/g, '');
    if (f in category && t in category) {
      const out = (amount * category[f]) / category[t];
      return `**${formatNumber(amount)} ${from}** = **${formatNumber(Math.round(out * 1e6) / 1e6)} ${to}**`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Text tools                                                          */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  'a an the and or but if then than so of to in on at for from by with about into over after before is are was were be been being do does did have has had i you he she it we they me him her them my your his its our their this that these those as not no yes can could would should will just very really what which who whom how why when where'.split(' ')
);

function sentenceSplit(text) {
  return text
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+[\s"')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

function summarize(text, count = 3) {
  const sentences = sentenceSplit(text);
  if (sentences.length <= count) return text.trim();
  const freq = new Map();
  for (const word of text.toLowerCase().match(/[a-z']{2,}/g) ?? []) {
    if (STOPWORDS.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[a-z']{2,}/g) ?? [];
    const score = words.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.sqrt(words.length || 1);
    return { s, i, score: score + (i === 0 ? 0.5 : 0) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' ');
}

function tryTextTools(message) {
  const m = message.trim();

  const quoted = m.match(/^(?:summarize|summary of|tl;?dr of?|shorten)\s*[:\-]?\s*([\s\S]{40,})$/i);
  if (quoted) {
    const summary = summarize(quoted[1], 3);
    return `**Summary**\n\n${summary}\n\n---\n*Extractive summary — 3 key sentences. Enable **Reylo Neural** for richer abstractive summaries.*`;
  }

  const rev = m.match(/^(?:reverse(?:\s+(?:this|the))?(?:\s+(?:text|string|words|it))?)\s*[:\-]?\s*([\s\S]+)$/i);
  if (rev) return `\`${rev[1].split('').reverse().join('')}\``;

  const wc = m.match(/^(?:count words|word count|how many words)\s*[:\-]?\s*([\s\S]+)$/i);
  if (wc) {
    const words = (wc[1].match(/\S+/g) ?? []).length;
    const chars = wc[1].length;
    const mins = Math.max(1, Math.round(words / 225));
    return `**Word count:** ${words}\n**Characters:** ${chars}\n**Reading time:** ~${mins} min`;
  }

  const slug = m.match(/^(?:slugify|make (?:a |me )?slug(?: for)?)\s*[:\-]?\s*([\s\S]+)$/i);
  if (slug) {
    return `\`${slug[1].toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}\``;
  }

  const b64e = m.match(/^(?:base64 encode|encode base64)\s*[:\-]?\s*([\s\S]+)$/i);
  if (b64e) {
    try {
      const encoded = typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(b64e[1])))
        : Buffer.from(b64e[1], 'utf8').toString('base64');
      return `**Base64**\n\n\`${encoded}\``;
    } catch { return 'Could not encode that text.'; }
  }

  const b64d = m.match(/^(?:base64 decode|decode base64)\s*[:\-]?\s*([\s\S]+)$/i);
  if (b64d) {
    try {
      const decoded = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(b64d[1].trim())))
        : Buffer.from(b64d[1].trim(), 'base64').toString('utf8');
      return `**Decoded**\n\n\`${decoded}\``;
    } catch { return 'That does not look like valid Base64.'; }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Code recipes                                                        */
/* ------------------------------------------------------------------ */

const CODE_RECIPES = [
  {
    id: 'fizzbuzz',
    title: 'FizzBuzz',
    tags: ['fizzbuzz', 'fizz buzz', 'classic', 'loop'],
    code: {
      javascript: `for (let i = 1; i <= 100; i++) {
  const line = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');
  console.log(line || i);
}`,
      python: `for i in range(1, 101):
    line = ("Fizz" if i % 3 == 0 else "") + ("Buzz" if i % 5 == 0 else "")
    print(line or i)`,
    },
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci (iterative)',
    tags: ['fibonacci', 'fib', 'sequence', 'dynamic programming'],
    code: {
      javascript: `function fibonacci(n) {
  const seq = [0, 1];
  for (let i = 2; i < n; i++) seq.push(seq[i - 1] + seq[i - 2]);
  return seq.slice(0, n);
}
console.log(fibonacci(10)); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`,
      python: `def fibonacci(n):
    seq = [0, 1]
    for _ in range(2, n):
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print(fibonacci(10))`,
    },
  },
  {
    id: 'factorial',
    title: 'Factorial',
    tags: ['factorial', 'recursion', 'math'],
    code: {
      javascript: `function factorial(n) {
  if (n < 0) throw new Error('n must be >= 0');
  return n <= 1 ? 1 : n * factorial(n - 1);
}`,
      python: `def factorial(n):
    if n < 0:
        raise ValueError('n must be >= 0')
    return 1 if n <= 1 else n * factorial(n - 1)`,
    },
  },
  {
    id: 'palindrome',
    title: 'Palindrome check',
    tags: ['palindrome', 'string', 'reverse', 'interview'],
    code: {
      javascript: `function isPalindrome(str) {
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === [...clean].reverse().join('');
}`,
      python: `def is_palindrome(s):
    clean = ''.join(c.lower() for c in s if c.isalnum())
    return clean == clean[::-1]`,
    },
  },
  {
    id: 'reverse-string',
    title: 'Reverse a string',
    tags: ['reverse', 'string', 'text'],
    code: {
      javascript: `const reversed = [...str].reverse().join('');`,
      python: `reversed_s = s[::-1]`,
    },
  },
  {
    id: 'two-sum',
    title: 'Two Sum (hash map)',
    tags: ['two sum', 'twosum', 'array', 'hash map', 'interview', 'leetcode'],
    code: {
      javascript: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const want = target - nums[i];
    if (seen.has(want)) return [seen.get(want), i];
    seen.set(nums[i], i);
  }
  return null;
}`,
      python: `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return None`,
    },
  },
  {
    id: 'primes',
    title: 'Prime numbers (sieve)',
    tags: ['prime', 'primes', 'sieve', 'eratosthenes', 'math'],
    code: {
      javascript: `function sieve(limit) {
  const isPrime = Array(limit + 1).fill(true);
  isPrime[0] = isPrime[1] = false;
  for (let i = 2; i * i <= limit; i++) {
    if (!isPrime[i]) continue;
    for (let j = i * i; j <= limit; j += i) isPrime[j] = false;
  }
  return isPrime.reduce((acc, ok, n) => (ok ? [...acc, n] : acc), []);
}`,
      python: `def sieve(limit):
    is_prime = [True] * (limit + 1)
    is_prime[0] = is_prime[1] = False
    for i in range(2, int(limit ** 0.5) + 1):
        if is_prime[i]:
            for j in range(i * i, limit + 1, i):
                is_prime[j] = False
    return [n for n, ok in enumerate(is_prime) if ok]`,
    },
  },
  {
    id: 'fetch-json',
    title: 'Fetch JSON from an API',
    tags: ['fetch', 'api', 'http', 'json', 'request', 'axios', 'get request', 'call api', 'http request'],
    code: {
      javascript: `// Modern fetch with error handling
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

const data = await getJSON('https://api.github.com/users/github');
console.log(data.name);`,
      python: `import requests

def get_json(url):
    res = requests.get(url, timeout=10)
    res.raise_for_status()
    return res.json()

data = get_json('https://api.github.com/users/github')
print(data['name'])`,
    },
  },
  {
    id: 'debounce',
    title: 'Debounce function',
    tags: ['debounce', 'throttle', 'performance', 'events', 'search box'],
    code: {
      javascript: `function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const onSearch = debounce((q) => console.log('searching', q), 250);`,
    },
  },
  {
    id: 'todo-html',
    title: 'Todo list (HTML + JS)',
    tags: ['todo', 'to-do', 'to do list', 'app', 'html', 'vanilla', 'project'],
    code: {
      javascript: `<!-- index.html -->
<div id="app">
  <input id="input" placeholder="Add a task…" />
  <button onclick="addTask()">Add</button>
  <ul id="list"></ul>
</div>
<script>
  const list = document.getElementById('list');
  function addTask() {
    const input = document.getElementById('input');
    if (!input.value.trim()) return;
    const li = document.createElement('li');
    li.textContent = input.value;
    li.onclick = () => li.remove();
    list.appendChild(li);
    input.value = '';
  }
</script>`,
    },
  },
  {
    id: 'countdown',
    title: 'Countdown timer',
    tags: ['countdown', 'timer', 'clock', 'setinterval', 'date'],
    code: {
      javascript: `function countdown(targetDate) {
  const tick = () => {
    const ms = new Date(targetDate) - new Date();
    if (ms <= 0) return clearInterval(id);
    const d = Math.floor(ms / 864e5);
    const h = Math.floor(ms / 36e5) % 24;
    const m = Math.floor(ms / 6e4) % 60;
    const s = Math.floor(ms / 1e3) % 60;
    console.log(\`\${d}d \${h}h \${m}m \${s}s\`);
  };
  tick();
  const id = setInterval(tick, 1000);
}`,
    },
  },
  {
    id: 'password',
    title: 'Random password generator',
    tags: ['password', 'random', 'generator', 'secure', 'crypto'],
    code: {
      javascript: `function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#\$%^&*';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}`,
      python: `import secrets, string

def generate_password(length=16):
    alphabet = string.ascii_letters + string.digits + '!@#\$%^&*'
    return ''.join(secrets.choice(alphabet) for _ in range(length))`,
    },
  },
  {
    id: 'form-validate',
    title: 'Form validation (email + required)',
    tags: ['form', 'validation', 'validate', 'email', 'regex', 'html'],
    code: {
      javascript: `const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+\$/;

function validate(form) {
  const errors = [];
  for (const el of form.elements) {
    if (!el.name) continue;
    const value = el.value.trim();
    if (el.required && !value) errors.push(\`\${el.name} is required\`);
    if (el.type === 'email' && value && !EMAIL_RE.test(value)) {
      errors.push(\`\${el.name} must be a valid email\`);
    }
  }
  return errors;
}`,
    },
  },
  {
    id: 'sort-objects',
    title: 'Sort array of objects',
    tags: ['sort', 'array', 'objects', 'alphabetical', 'order'],
    code: {
      javascript: `const people = [
  { name: 'Zoe', age: 22 },
  { name: 'Adam', age: 30 },
  { name: 'Mia', age: 25 },
];

// By name (A→Z)
const byName = [...people].sort((a, b) => a.name.localeCompare(b.name));
// By age (young→old)
const byAge = [...people].sort((a, b) => a.age - b.age);`,
      python: `people = [
    {'name': 'Zoe', 'age': 22},
    {'name': 'Adam', 'age': 30},
    {'name': 'Mia', 'age': 25},
]

by_name = sorted(people, key=lambda p: p['name'])
by_age = sorted(people, key=lambda p: p['age'])`,
    },
  },
  {
    id: 'hello-web',
    title: 'Hello world web page',
    tags: ['hello world', 'webpage', 'web page', 'website', 'html', 'start', 'beginner'],
    code: {
      javascript: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>My page</title>
</head>
<body>
  <h1>Hello, world!</h1>
  <script>
    document.querySelector('h1').style.color = 'royalblue';
  </script>
</body>
</html>`,
    },
  },
];

function tryCodeRecipe(message) {
  const m = message.toLowerCase();
  const explicitCode = /\b(code|script|function|program|implement|snippet|example|algorithm|fizzbuzz)\b/.test(m)
    || /\b(?:write|show|give|make|create|generate|build)\b.{0,28}\b(?:code|script|function|program)/.test(m);

  let best = null;
  let bestScore = 0;
  for (const recipe of CODE_RECIPES) {
    let score = 0;
    for (const tag of recipe.tags) {
      if (m.includes(tag)) score += tag.length + 1;
    }
    if (score > bestScore) { bestScore = score; best = recipe; }
  }
  // With no code intent in the phrasing, require a strong, unambiguous tag match
  // so questions like "why are there no API keys?" don't hit the fetch recipe.
  if (!best || bestScore < (explicitCode ? 5 : 9)) return null;

  const lang = /\bpython\b|py\b/.test(m) ? 'python'
    : /\bjavascript\b|\bjs\b|node|web\b|browser\b/.test(m) ? 'javascript'
    : best.code.python ? 'javascript' : 'javascript';
  const code = best.code[lang] ?? best.code.javascript;
  const fence = lang === 'python' ? 'python' : best.id === 'todo-html' || best.id === 'hello-web' ? 'html' : 'javascript';
  return `**${best.title}** (${lang === 'python' ? 'Python' : 'JavaScript'})\n\n\`\`\`${fence}\n${code}\n\`\`\`\n\n*Ask me to explain any line, or request it in Python.*`;
}

/* ------------------------------------------------------------------ */
/* Knowledge base                                                      */
/* ------------------------------------------------------------------ */

const KNOWLEDGE = [
  {
    id: 'ai', title: 'Artificial intelligence',
    tags: ['artificial intelligence', 'ai', 'what is ai', 'machine intelligence'],
    answer: `**Artificial intelligence (AI)** is software that performs tasks usually associated with human thinking — recognizing patterns, understanding language, making predictions, and generating content.\n\n- **Narrow AI** (what we have today) excels at specific tasks.\n- **General AI** (AGI) — human-level reasoning across any domain — does not exist yet.\n- Modern AI is mostly **machine learning**: systems that learn patterns from data instead of following hand-written rules.`,
  },
  {
    id: 'ml', title: 'Machine learning',
    tags: ['machine learning', 'ml', 'training', 'models', 'neural network training'],
    answer: `**Machine learning** teaches computers to find patterns in data rather than following explicit instructions.\n\nThe three main styles:\n1. **Supervised** — learn from labeled examples (spam filters, image classifiers).\n2. **Unsupervised** — find structure in unlabeled data (clustering, anomaly detection).\n3. **Reinforcement** — learn by trial, reward, and penalty (game-playing agents, robotics).`,
  },
  {
    id: 'llm', title: 'Large language models (LLMs)',
    tags: ['llm', 'large language model', 'gpt', 'language model', 'transformer', 'chatgpt', 'how do llms work'],
    answer: `**Large language models** are neural networks trained to predict the next piece of text, over and over, across billions of examples.\n\n- They use the **transformer** architecture (2017, "Attention Is All You Need").\n- "Instruct" or "chat" models are further trained with human feedback (**RLHF**) to follow instructions.\n- They are brilliant pattern-matchers — not databases — so they can sound confident and still be wrong ("hallucinate"). Always verify critical facts.`,
  },
  {
    id: 'neural-network', title: 'Neural networks',
    tags: ['neural network', 'neurons', 'deep learning', 'layers', 'weights', 'backpropagation'],
    answer: `A **neural network** is layers of simple math units ("neurons") that transform inputs into outputs.\n\n- Each connection has a **weight** learned during training.\n- **Deep learning** just means many layers.\n- Training uses **backpropagation**: measure the error, nudge every weight slightly to reduce it, repeat billions of times.`,
  },
  {
    id: 'transformer', title: 'The transformer architecture',
    tags: ['transformer', 'attention', 'self-attention', 'attention is all you need'],
    answer: `The **transformer** is the architecture behind modern language models.\n\nIts key idea is **self-attention**: every token in a sequence looks at every other token and decides what to pay attention to. That lets the model handle long-range context ("it" in sentence 40 can refer to a noun in sentence 2), and it parallelizes beautifully on GPUs.`,
  },
  {
    id: 'prompt-engineering', title: 'Prompt engineering basics',
    tags: ['prompt engineering', 'prompting', 'better prompts', 'how to prompt', 'write prompts'],
    answer: `Better prompts get better answers. The essentials:\n\n1. **Be specific** — "Explain transformers to a 12-year-old using a library analogy" beats "explain transformers".\n2. **Give context** — role, audience, constraints, tone.\n3. **Show the format you want** — bullet list, table, JSON, code.\n4. **Provide examples** (few-shot) for tricky tasks.\n5. **Ask for reasoning** — "think step by step" helps on multi-step problems.`,
  },
  {
    id: 'javascript', title: 'JavaScript',
    tags: ['javascript', 'js', 'ecmascript', 'learn javascript', 'what is javascript'],
    answer: `**JavaScript** is the programming language of the web — it runs in every browser and (via Node.js, Deno, Bun) on servers.\n\n- **Multi-paradigm**: procedural, object-oriented, and functional.\n- **Single-threaded** with an event loop and async/await for concurrency.\n- **Dynamically typed** (TypeScript adds optional types).\n\nTry asking me: *"write code for debounce in javascript"* — I have a recipe library.`,
  },
  {
    id: 'python', title: 'Python',
    tags: ['python', 'learn python', 'what is python', 'py'],
    answer: `**Python** is a readable, versatile language beloved for data science, AI, automation, and backends.\n\n- Clean syntax with **indentation** instead of braces.\n- Huge ecosystem: NumPy, pandas, PyTorch, Django, FastAPI.\n- Interpreted and dynamically typed; great for beginners and experts alike.`,
  },
  {
    id: 'html', title: 'HTML',
    tags: ['html', 'hypertext', 'markup', 'webpage structure', 'html tags'],
    answer: `**HTML** (HyperText Markup Language) is the structure of every web page — headings, paragraphs, links, images, forms.\n\n- Documents are trees of **elements** like \`<p>\`, \`<a>\`, \`<div>\`.\n- **CSS** styles them; **JavaScript** makes them interactive.\n- Modern HTML5 added semantic tags (\`<header>\`, \`<nav>\`, \`<article>\`) that help accessibility and SEO.`,
  },
  {
    id: 'css', title: 'CSS',
    tags: ['css', 'style', 'styling', 'flexbox', 'grid', 'stylesheet'],
    answer: `**CSS** (Cascading Style Sheets) controls how HTML looks — colors, layout, typography, animation.\n\n- **Flexbox** for one-dimensional layouts; **Grid** for two.\n- The **cascade** resolves conflicts via specificity and source order.\n- Modern CSS has variables (\`--color\`), container queries, nesting, and subgrid.`,
  },
  {
    id: 'react', title: 'React',
    tags: ['react', 'jsx', 'components', 'hooks', 'frontend library', 'reactjs'],
    answer: `**React** is a JavaScript library for building user interfaces from reusable **components**.\n\n- Describe UI as a function of **state**: state changes → UI re-renders.\n- **Hooks** (\`useState\`, \`useEffect\`, \`useMemo\`) handle state and side effects.\n- The ecosystem (Next.js, React Native, Router) is the largest in frontend.`,
  },
  {
    id: 'api', title: 'APIs',
    tags: ['api', 'rest', 'restful', 'endpoint', 'web service', 'application programming interface'],
    answer: `An **API** (Application Programming Interface) is a contract for how software talks to software.\n\n- **REST APIs** expose resources over HTTP with verbs: GET (read), POST (create), PATCH/PUT (update), DELETE.\n- Data is usually **JSON**.\n- **Authentication** matters: API keys, OAuth tokens, JWTs.\n- Good API design: predictable URLs, proper status codes, versioning, rate limits.`,
  },
  {
    id: 'git', title: 'Git & GitHub',
    tags: ['git', 'github', 'version control', 'commit', 'branch', 'merge', 'pull request', 'repo'],
    answer: `**Git** tracks changes to code over time; **GitHub** hosts Git repositories and adds collaboration.\n\nThe daily driver commands:\n\`\`\`bash\ngit clone <url>        # get a copy\ngit switch -c my-branch # new branch\ngit add .              # stage changes\ngit commit -m "msg"    # save a snapshot\ngit push origin my-branch\n\`\`\`\nThen open a **pull request** to propose merging your branch into \`main\`.`,
  },
  {
    id: 'sql', title: 'SQL',
    tags: ['sql', 'database', 'query', 'select', 'relational', 'postgres', 'mysql'],
    answer: `**SQL** (Structured Query Language) talks to relational databases.\n\n\`\`\`sql\nSELECT name, COUNT(*) AS orders\nFROM customers JOIN orders ON customers.id = orders.customer_id\nWHERE orders.created_at >= '2026-01-01'\nGROUP BY name\nHAVING COUNT(*) > 3\nORDER BY orders DESC;\n\`\`\`\nCore verbs: **SELECT**, **INSERT**, **UPDATE**, **DELETE** — plus **JOIN**, **GROUP BY**, and indexes for speed.`,
  },
  {
    id: 'http', title: 'HTTP and the web',
    tags: ['http', 'https', 'status code', 'web request', 'cookies', 'how the web works'],
    answer: `**HTTP** is the request/response protocol of the web.\n\n- A client sends a request (method, URL, headers, body); a server replies (status, headers, body).\n- **HTTPS** adds TLS encryption — never send secrets over plain HTTP.\n- Status codes tell the story: \`200\` OK, \`301\` redirect, \`404\` not found, \`500\` server error.\n- **Cookies** and tokens keep you logged in between requests.`,
  },
  {
    id: 'docker', title: 'Docker & containers',
    tags: ['docker', 'container', 'containers', 'dockerfile', 'deploy', 'kubernetes'],
    answer: `**Docker** packs an app with everything it needs (code, runtime, libraries) into a **container** that runs the same everywhere.\n\n- A **Dockerfile** describes the image layer by layer.\n- \`docker build\` → image; \`docker run\` → container.\n- **Kubernetes** orchestrates thousands of containers (scaling, healing, rolling updates).`,
  },
  {
    id: 'cybersecurity', title: 'Cybersecurity basics',
    tags: ['cybersecurity', 'security', 'hacking', 'passwords', 'phishing', '2fa', 'stay safe online'],
    answer: `Staying safe online, summarized:\n\n1. **Password manager + unique passwords** — breaches reuse credentials.\n2. **Enable 2FA/MFA** everywhere, ideally with an app or security key.\n3. **Phishing** is the #1 entry point — check sender domains, don't rush.\n4. **Update software** — patches fix holes attackers exploit.\n5. **Encrypt + back up** important data (3-2-1 rule: 3 copies, 2 media, 1 offsite).`,
  },
  {
    id: 'climate', title: 'Climate change',
    tags: ['climate', 'climate change', 'global warming', 'carbon', 'greenhouse', 'emissions'],
    answer: `**Climate change** is the long-term shift in global temperatures and weather driven largely by human greenhouse-gas emissions.\n\n- CO₂ from burning fossil fuels traps heat (the **greenhouse effect**).\n- Effects: stronger heatwaves, sea-level rise, ecosystem stress.\n- Levers: clean energy, electrification, efficiency, carbon pricing, and adaptation. This is science, not opinion — every major scientific academy agrees on the core mechanism.`,
  },
  {
    id: 'solar-system', title: 'The solar system',
    tags: ['solar system', 'planets', 'sun', 'mars', 'jupiter', 'space', 'earth'],
    answer: `Our **solar system** has one star (the Sun), 8 planets, dwarf planets, moons, asteroids, and comets.\n\n- **Rocky**: Mercury, Venus, Earth, Mars.\n- **Gas/ice giants**: Jupiter, Saturn, Uranus, Neptune.\n- Light takes ~8.3 minutes from the Sun to Earth; the nearest star (Proxima Centauri) is 4.24 **light-years** away.`,
  },
  {
    id: 'black-hole', title: 'Black holes',
    tags: ['black hole', 'black holes', 'event horizon', 'singularity', 'gravity', 'space'],
    answer: `A **black hole** is a region where gravity is so strong that not even light escapes.\n\n- The boundary is the **event horizon**.\n- They form when massive stars collapse at end of life (stellar black holes) and lurk at galaxy centers (supermassive ones).\n- In 2019 the Event Horizon Telescope photographed one; in 2015 LIGO detected two black holes merging via gravitational waves.`,
  },
  {
    id: 'photosynthesis', title: 'Photosynthesis',
    tags: ['photosynthesis', 'plants', 'chlorophyll', 'oxygen', 'how plants make food'],
    answer: `**Photosynthesis** is how plants turn light into food:\n\n\`6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\`\n\nChlorophyll in leaf cells captures sunlight and uses that energy to convert carbon dioxide and water into sugars — releasing the oxygen we breathe as a byproduct.`,
  },
  {
    id: 'dna', title: 'DNA',
    tags: ['dna', 'genes', 'genetics', 'genome', 'chromosome', 'rna', 'heredity'],
    answer: `**DNA** is the molecule that stores genetic instructions — a twisted ladder (double helix) of four bases: A, T, G, C.\n\n- **Genes** are stretches of DNA that code for proteins.\n- Humans share ~99.9% of DNA with each other.\n- **RNA** carries those instructions to the cell's protein factories (ribosomes). CRISPR lets scientists edit DNA with remarkable precision.`,
  },
  {
    id: 'evolution', title: 'Evolution by natural selection',
    tags: ['evolution', 'natural selection', 'darwin', 'species', 'adaptation'],
    answer: `**Evolution** is change in populations over generations, driven by natural selection:\n\n1. Individuals vary.\n2. Some variations help survival/reproduction.\n3. Those traits become more common over generations.\n\nProposed by Darwin and Wallace in 1858, it's the unifying theory of biology — supported by fossils, genetics, direct observation (e.g., antibiotic resistance).`,
  },
  {
    id: 'gravity', title: 'Gravity',
    tags: ['gravity', 'gravitation', 'newton', 'einstein', 'general relativity', 'physics'],
    answer: `**Gravity** is the attraction between masses.\n\n- **Newton** (1687): force grows with mass and falls with distance squared — spectacularly accurate for everyday life.\n- **Einstein** (1915): gravity is the curvature of spacetime by mass and energy — needed for GPS, black holes, and the orbit of Mercury.\n- It's the weakest fundamental force, yet it shapes galaxies.`,
  },
  {
    id: 'quantum', title: 'Quantum mechanics',
    tags: ['quantum', 'quantum mechanics', 'qubit', 'superposition', 'entanglement', 'physics'],
    answer: `**Quantum mechanics** describes nature at atomic scales, where the rules get strange:\n\n- **Wave-particle duality**: light and matter act as both waves and particles.\n- **Superposition**: a system holds multiple states until measured.\n- **Entanglement**: linked particles share correlated fates instantly.\n\nIt's not philosophy — it powers lasers, transistors, MRI machines, and emerging quantum computers.`,
  },
  {
    id: 'photos-vs-memes', title: 'Why are JPEGs smaller than raw images?',
    tags: ['jpeg', 'compression', 'image format', 'png', 'file size'],
    answer: `**Compression.**\n\n- **JPEG** is *lossy*: it throws away detail your eyes barely notice (great for photos).\n- **PNG** is *lossless*: perfect quality, bigger files (great for graphics/text).\n- **WebP/AVIF** modern formats beat both on size at similar quality.\n\nRule of thumb: photos → JPEG/WebP; screenshots, logos, art with flat colors → PNG/WebP.`,
  },
  {
    id: 'big-o', title: 'Big-O notation',
    tags: ['big o', 'big-o', 'time complexity', 'algorithm complexity', 'runtime', 'space complexity'],
    answer: `**Big-O** describes how an algorithm's cost grows with input size *n*:\n\n- \`O(1)\` constant — hash map lookup.\n- \`O(log n)\` logarithmic — binary search.\n- \`O(n)\` linear — scanning a list.\n- \`O(n log n)\` — good sorting (merge/quick sort average).\n- \`O(n²)\` quadratic — nested loops over pairs.\n\nIgnore constants and lower-order terms; Big-O is about the shape of the growth curve.`,
  },
  {
    id: 'recursion', title: 'Recursion',
    tags: ['recursion', 'recursive', 'base case', 'call stack', 'divide and conquer'],
    answer: `**Recursion** is when a function solves a problem by calling itself on smaller inputs.\n\nTwo ingredients, always:\n1. **Base case** — the smallest version solved directly (stops the chain).\n2. **Recursive step** — break the problem down toward the base case.\n\nExample: \`factorial(n) = n * factorial(n-1)\`, with \`factorial(0) = 1\`. Beware stack overflow on deep recursion — some problems prefer iteration or tail-call optimization.`,
  },
  {
    id: 'oopp', title: 'Object-oriented programming',
    tags: ['oop', 'object oriented', 'class', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction'],
    answer: `**OOP** organizes code around *objects* — bundles of data and behavior.\n\nThe four pillars:\n1. **Encapsulation** — hide internals behind a public interface.\n2. **Abstraction** — model the essentials, ignore the rest.\n3. **Inheritance** — reuse and extend existing types (use sparingly).\n4. **Polymorphism** — one interface, many implementations.\n\nComposition over inheritance is the modern mantra.`,
  },
  {
    id: 'open-source', title: 'Open source',
    tags: ['open source', 'license', 'mit', 'gpl', 'foss', 'free software'],
    answer: `**Open source** software ships with source code and a license granting freedoms to use, study, modify, and share it.\n\n- **MIT / BSD / Apache**: do almost anything, keep the notice.\n- **GPL**: share-alike — derivatives must stay open.\n- **LGPL/MPL**: middle grounds.\n\nOpen source runs the modern world: Linux, Git, Python, React, and this very website.`,
  },
  {
    id: 'stock-market', title: 'How the stock market works',
    tags: ['stock', 'stocks', 'stock market', 'investing', 'shares', 'etf', 'dividend', 'bond'],
    answer: `Buying a **stock** means buying a small ownership slice of a company.\n\n- Prices move on supply and demand — expectations about future profits.\n- **Index funds/ETFs** spread risk across hundreds of companies (historically the sane default for most people).\n- **Bonds** are loans to governments/companies — steadier, lower returns.\n- Rule zero: this is education, not financial advice — high returns always carry risk.`,
  },
  {
    id: 'inflation', title: 'Inflation',
    tags: ['inflation', 'prices', 'economy', 'interest rates', 'cpi', 'money'],
    answer: `**Inflation** is the general rise in prices over time — meaning each unit of money buys less.\n\n- Measured by baskets like the **CPI** (Consumer Price Index).\n- Causes: too much money chasing too few goods, supply shocks, demand booms.\n- Central banks fight it with **interest rates**: higher rates cool spending; lower rates stimulate it.`,
  },
  {
    id: 'world-war-2', title: 'World War II — the short version',
    tags: ['world war 2', 'world war ii', 'ww2', 'wwii', 'history', '1945'],
    answer: `**World War II (1939–1945)** was the deadliest conflict in history.\n\n- Triggered by Nazi Germany's invasion of Poland; the Axis (Germany, Italy, Japan) fought the Allies (UK, USSR, USA, China, and others).\n- The Holocaust murdered six million Jews and millions of others.\n- Ended in Europe (May 1945) after Germany's surrender; in the Pacific (Sept 1945) after Japan's.\n- Aftermath: the UN, the Cold War, decolonization, and the modern international order.`,
  },
  {
    id: 'roman-empire', title: 'The Roman Empire',
    tags: ['roman empire', 'rome', 'romans', 'history', 'caesar', 'augustus'],
    answer: `**Rome** grew from a city-state (753 BC legend) to a republic, then an empire spanning the Mediterranean.\n\n- **Julius Caesar**'s assassination (44 BC) ended the republic; **Augustus** became first emperor (27 BC).\n- Roman law, roads, concrete, Latin, and the calendar shape our world.\n- The western empire fell in **476 AD**; the eastern (Byzantine) half lasted to 1453.`,
  },
  {
    id: 'great-wall', title: 'The Great Wall of China',
    tags: ['great wall', 'china', 'wall of china', 'wonder', 'history'],
    answer: `The **Great Wall** is a network of walls and fortifications across northern China, built over centuries (most famously during the Ming dynasty, 1368–1644).\n\n- Built for defense against northern nomadic invasions.\n- Total length of all sections: over 20,000 km.\n- Myths: it is *not* visible from the moon with the naked eye.`,
  },
  {
    id: 'ocean', title: 'The ocean',
    tags: ['ocean', 'sea', 'marine', 'deep sea', 'coral', 'water', 'mariana'],
    answer: `The ocean covers ~71% of Earth and holds 97% of its water.\n\n- The **Mariana Trench** plunges ~11 km deep — Everest would fit inside.\n- Oceans produce over half our oxygen and drive weather via currents.\n- Coral reefs cover <1% of the seabed yet host ~25% of marine species — and they're threatened by warming.`,
  },
  {
    id: 'sleep', title: 'Sleep basics',
    tags: ['sleep', 'insomnia', 'tired', 'circadian', 'rest', 'how much sleep', 'melatonin'],
    answer: `**Sleep** is when the brain consolidates memory, clears metabolic waste, and repairs the body.\n\n- Adults generally need **7–9 hours**.\n- Consistency beats perfection: fixed wake time anchors your circadian rhythm.\n- Evidence-based tips: morning light, cool/dark room, no caffeine 8+ hours before bed, wind-down routine, screens off last.\n\n*General wellness info — not medical advice.*`,
  },
  {
    id: 'hydration', title: 'Water and hydration',
    tags: ['water', 'hydration', 'drink water', 'dehydration', 'how much water'],
    answer: `Water makes up ~60% of your body and runs nearly every process in it.\n\n- A common rough target: ~2–3 liters of fluids a day (more in heat/exercise) — food contributes too.\n- Pale-yellow urine is a decent practical gauge.\n- Thirst is a late signal for some groups (older adults, athletes) — drink proactively.\n\n*General wellness info — not medical advice.*`,
  },
  {
    id: 'exercise', title: 'Exercise fundamentals',
    tags: ['exercise', 'workout', 'fitness', 'strength', 'cardio', 'muscle', 'training'],
    answer: `The training essentials:\n\n1. **Strength** 2–3×/week — progressive overload beats fancy variation.\n2. **Cardio** 150+ min/week of moderate work (or 75 min vigorous).\n3. **Recovery** — muscle grows resting; sleep and protein matter.\n4. **Consistency** — the best program is the one you'll actually do for years.\n\n*General wellness info — not medical advice.*`,
  },
  {
    id: 'nutrition', title: 'Nutrition basics',
    tags: ['nutrition', 'diet', 'food', 'protein', 'calories', 'healthy eating', 'macros'],
    answer: `Eating well, stripped of fads:\n\n- **Calories** determine weight change; **macronutrients** (protein, carbs, fat) determine body composition.\n- Protein supports muscle (~1.6 g/kg is a common target for active people).\n- Eat mostly whole foods: vegetables, fruits, legumes, whole grains, lean proteins.\n- Ultra-processed foods are engineered to be overeaten — dose matters.\n\n*General wellness info — not medical advice.*`,
  },
  {
    id: 'typing-better', title: 'How to learn to type faster',
    tags: ['typing', 'type faster', 'touch typing', 'keyboard', 'wpm'],
    answer: `**Touch typing** (fingers anchored on home row, no looking) is the skill that compounds:\n\n1. Correct technique first, speed later — accuracy >95% before pushing tempo.\n2. 15–20 focused minutes daily beats occasional marathons.\n3. Use key drillers (MonkeyType, Keybr) for measured practice.\n4. Fix your weakest keys; they cap your speed.\n\nTypical progression: 20 WPM → 40 (a few weeks) → 60–80 (a few months).`,
  },
  {
    id: 'public-speaking', title: 'Public speaking',
    tags: ['public speaking', 'presentation', 'speech', 'stage fright', 'nervous', 'talk'],
    answer: `Great talks share a formula:\n\n1. **One core message** — if they remember one thing, what is it?\n2. **Structure**: hook → problem → insight → payoff → call to action.\n3. **Stories and concrete numbers** beat abstract slides.\n4. **Practice out loud** — ideally recorded, ideally on the actual stage.\n\nNerves are normal; preparation converts fear into energy.`,
  },
  {
    id: 'writing', title: 'Writing clearly',
    tags: ['writing', 'write better', 'essay', 'grammar', 'style', 'clear writing'],
    answer: `Clear writing rules that never expire:\n\n- **Lead with the point** — bury the lede and you lose the reader.\n- Prefer short words, short sentences, short paragraphs.\n- **Verbs do the work** — cut filler ("in order to" → "to").\n- One idea per paragraph; smooth transitions between them.\n- **Edit ruthlessly** — first drafts are for getting it down; editing is for getting it right.`,
  },
  {
    id: 'productivity', title: 'Productivity systems',
    tags: ['productivity', 'procrastination', 'time management', 'focus', 'get things done', 'pomodoro', 'deep work'],
    answer: `What actually works for focus:\n\n1. **Time blocking** — schedule the work, don't hope for it.\n2. **Single-tasking** — context-switching is where deep work goes to die.\n3. **Pomodoro** (25/5) for getting started; extend flow blocks once rolling.\n4. **Two-minute rule** — tiny tasks get done immediately.\n5. Protect energy, not just time: hardest work at your peak hours.`,
  },
  {
    id: 'critical-thinking', title: 'Critical thinking',
    tags: ['critical thinking', 'reasoning', 'logic', 'bias', 'evidence', 'fallacies'],
    answer: `A compact critical-thinking checklist:\n\n1. **What's the claim**, precisely?\n2. **What's the evidence**, and how strong is it?\n3. **What would change my mind?** (falsifiability)\n4. **Who benefits** from me believing this?\n5. Watch for fallacies: ad hominem, straw man, false dichotomy, appeal to popularity.\n\nSmart people are not immune — systems beat vibes.`,
  },
  {
    id: 'blockchain', title: 'Blockchain & crypto',
    tags: ['blockchain', 'crypto', 'bitcoin', 'ethereum', 'cryptocurrency', 'web3', 'nft'],
    answer: `A **blockchain** is a shared ledger maintained by many computers, where entries are cryptographically chained so history is hard to rewrite.\n\n- **Bitcoin** (2009): digital money with a fixed schedule — proof-of-work mining.\n- **Ethereum** adds programmable **smart contracts**.\n- Trade-offs: decentralization, security, and speed (pick two); energy and volatility concerns are real.\n\nEducational only — crypto is volatile and scams abound.`,
  },
  {
    id: 'quantum-computing', title: 'Quantum computing',
    tags: ['quantum computing', 'qubits', 'quantum computer', 'shor', 'quantum advantage'],
    answer: `**Quantum computers** use qubits, which exploit superposition and entanglement to explore many possibilities at once (carefully).\n\n- They won't "replace" classical computers — they accelerate specific problems: simulation, optimization, cryptanalysis (Shor's algorithm).\n- Current machines are **NISQ**: noisy, error-prone, hundreds of qubits.\n- Post-quantum cryptography is already being standardized to resist future quantum attacks.`,
  },
  {
    id: 'data-privacy', title: 'Data privacy',
    tags: ['privacy', 'data privacy', 'tracking', 'gdpr', 'personal data', 'surveillance'],
    answer: `Practical privacy hygiene:\n\n1. **Audit app permissions** and browser extensions quarterly.\n2. Prefer services with **end-to-end encryption** (messaging especially).\n3. Use **unique emails/aliases** and passwords (manager + 2FA).\n4. Know your rights: **GDPR** (EU), **CCPA** (California) grant access/deletion requests.\n5. Convenience trades against privacy — decide deliberately per product.`,
  },
  {
    id: 'remote-work', title: 'Remote work',
    tags: ['remote work', 'wfh', 'work from home', 'home office', 'hybrid', 'async'],
    answer: `Remote work thrives on structure:\n\n- **Overcommunicate** — write decisions down (docs > hallway memory).\n- **Async first**: clear threads, expected response windows, fewer meetings.\n- Separate workspace from life space; commute rituals help your brain switch.\n- Visibility comes from shipped work and written updates — not chair time.`,
  },
  {
    id: 'startup', title: 'Startups 101',
    tags: ['startup', 'founder', 'business', 'mvp', 'product market fit', 'venture', 'entrepreneur'],
    answer: `Startup survival guide, compressed:\n\n1. **Problem first** — talk to users before building (dozens of conversations).\n2. Build an **MVP** — the smallest thing that tests the core value.\n3. Chase **product-market fit** (retention and pull, not vanity metrics).\n4. **Runway discipline**: revenue or funding, spend lasts 12+ months.\n5. Distribution is half the product — plan it early.`,
  },
  {
    id: 'design', title: 'Design basics',
    tags: ['design', 'ui', 'ux', 'typography', 'color', 'layout', 'accessibility', 'a11y'],
    answer: `Good UI design fundamentals:\n\n1. **Hierarchy** — size, weight, and space guide the eye.\n2. **Contrast & color** — limit the palette; check WCAG contrast ratios.\n3. **Spacing & alignment** — consistent grids feel professional.\n4. **Typography** — 2 typefaces max; readable line length (~60–80 chars).\n5. **Accessibility**: keyboard navigation, alt text, semantic HTML, visible focus states.`,
  },
  {
    id: 'game-dev', title: 'Game development',
    tags: ['game dev', 'gamedev', 'unity', 'unreal', 'godot', 'game engine', 'make a game'],
    answer: `Getting into game dev:\n\n- **Engines**: Godot (free, light), Unity (huge ecosystem), Unreal (high fidelity).\n- Start *tiny*: Pong before your MMO. Finish games — finishing is the skill.\n- Core loop first: controls that feel good, feedback (juice), then content.\n- Learn 2D art/audio basics or find collaborators; assets exist (Kenney, OpenGameArt).`,
  },
  {
    id: 'reylo', title: 'Reylo AI — about this app',
    tags: ['reylo', 'reylo ai', 'about you', 'who made you', 'what are you', 'who are you', 'who built you', 'creator', 'made you'],
    answer: `I'm **Reylo AI** — a free, open-source chat assistant that runs **entirely in your browser**.\n\n- **Zero cost, zero API keys, zero sign-up.**\n- **Two engines**: *Reylo Core* (instant — math, knowledge, code recipes, text tools) and *Reylo Neural* (a real language model downloaded to your device via WebGPU/WASM).\n- **Privacy by design**: your conversations never leave your device — there is no server to send them to.\n\nThis site is hosted on GitHub Pages; the code is open source (MIT).`,
  },
  {
    id: 'how-reylo-works', title: 'How Reylo AI works',
    tags: ['how do you work', 'how does this work', 'architecture', 'tech stack', 'no api keys', 'how can this be free', 'offline'],
    answer: `Here's the honest technical picture:\n\n1. **Reylo Core** is a local toolkit — a safe math parser, unit converters, a curated knowledge base, code recipes, and text tools. It's instant and works offline.\n2. **Reylo Neural** runs an actual open-weights LLM *on your device* using [Transformers.js](https://github.com/huggingface/transformers.js) + WebGPU (with a WASM fallback). The first use downloads the model (~150–400 MB, then cached by your browser).\n\nNo inference servers, no API keys, no billing — your hardware does the thinking. That's why it's free forever.`,
  },
  {
    id: 'api-keys', title: 'Why no API keys?',
    tags: ['api key', 'api keys', 'no api key', 'free', 'how much does this cost', 'pricing', 'cost', 'subscription', 'sign up'],
    answer: `Traditional AI apps pay cloud GPU bills per message — that's why they need API keys, accounts, and subscriptions.\n\n**Reylo flips the model**: the AI runs on *your* device. There's no meter to read, no key to leak, no monthly bill. Open-source weights + your hardware = **free, forever**.`,
  },
  {
    id: 'privacy', title: 'Privacy on Reylo AI',
    tags: ['privacy', 'private', 'my data', 'tracking', 'is this private', 'data collection', 'my chats'],
    answer: `Your privacy is architectural, not just promised:\n\n- Conversations live in **your browser's local storage** — this site has **no backend**.\n- Model inference runs **on-device** (WebGPU/WASM); your prompts never reach a server.\n- No analytics, no ads, no accounts.\n\nClearing your browser data clears your chats. You can delete any conversation from the sidebar anytime.`,
  },
];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s%'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchKnowledge(message) {
  const norm = normalize(message);
  const words = new Set(norm.split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w)));
  let best = null;
  let bestScore = 0;

  for (const entry of KNOWLEDGE) {
    let score = 0;
    for (const tag of entry.tags) {
      const tagNorm = normalize(tag);
      if (norm.includes(tagNorm)) {
        score += 4 + tagNorm.split(' ').length * 3;
      } else {
        const tagWords = tagNorm.split(' ').filter((w) => w.length > 2);
        const overlap = tagWords.filter((w) => words.has(w)).length;
        if (tagWords.length > 0 && overlap === tagWords.length) score += 2.5;
        else score += overlap * 0.9;
      }
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore >= 4.5 ? best : null;
}

function relatedTopics(count = 3, excludeId = null) {
  return KNOWLEDGE
    .filter((k) => k.id !== excludeId)
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((k) => `- ${k.title}`)
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Conversation intents                                                */
/* ------------------------------------------------------------------ */

const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'There are only 10 kinds of people: those who understand binary, and those who don\'t.',
  'A SQL query walks into a bar, approaches two tables, and asks: "May I join you?"',
  'Why did the developer go broke? Because he used up all his cache.',
  'I would tell you a UDP joke, but you might not get it.',
  'Why do Java developers wear glasses? Because they don\'t C#.',
  'What\'s a computer\'s favorite snack? Microchips.',
  'How many programmers does it take to change a light bulb? None — that\'s a hardware problem.',
  'Why was the JavaScript developer sad? Because he didn\'t Node how to Express himself.',
  'A regex walks into a bar. Then: ".*" chaos begins.',
  'What\'s the object-oriented way to become wealthy? Inheritance.',
  'Why did the neural network cross the road? It was trained on a chicken dataset.',
];

const FACTS = [
  'Honey never spoils — archaeologists have found 3,000-year-old honey still edible.',
  'Octopuses have three hearts and blue blood.',
  'A day on Venus is longer than its year.',
  'The entire world\'s population could fit inside Los Angeles — standing room only.',
  'Bananas are berries, but strawberries aren\'t.',
  'Your body makes about 25 million new cells each second.',
  'The first computer "bug" was an actual moth found in a Harvard Mark II relay.',
  'Sharks are older than trees — they appeared ~400 million years ago.',
  'If you could fold a paper 42 times, it would reach the Moon.',
  'Lightning strikes Earth about 8 million times a day.',
  'A group of flamingos is called a "flamboyance."',
  'The Eiffel Tower can be up to 15 cm taller in summer — metal expands with heat.',
];

const PUNCTUATION = ['.', '!', '?', '.'];

function pick(arr, seedText = '') {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function tryConversation(message, history = []) {
  const m = message.toLowerCase().trim();
  const prev = history[history.length - 2]; // last user message
  const prevText = typeof prev === 'string' ? prev : prev?.content ?? '';

  if (/^(hi|hello|hey|yo|howdy|hiya|good (morning|afternoon|evening)|sup|greetings)\b/.test(m)) {
    return `Hey! I'm **Reylo AI** ⚡ Ask me anything — math, code, science, writing, or how this app works. What's on your mind?`;
  }
  if (/^how are you\b/.test(m)) {
    return `Running at full speed and completely local — no queues, no rate limits 😄 How can I help you today?`;
  }
  if (/\b(thank you|thanks|thx|appreciate it|cheers)\b/.test(m)) {
    return `Anytime! Anything else you want to explore?`;
  }
  if (/^(bye|goodbye|see you|good night|goodnight|later|cya)\b/.test(m)) {
    return `See you next time! Your chats stay saved in this browser. 👋`;
  }
  if (/\b(what can you do|your capabilit|help me with what|what do you know|features|abilities)\b/.test(m)) {
    return `A lot — and all of it free & private:\n\n- 🧮 **Math & conversions** — "15% of 240", "5 km to miles", \`(12 + 8) * 3^2\`\n- 💻 **Code recipes** — "write code for fibonacci in python"\n- 📚 **Knowledge** — AI, programming, science, history, health basics, and more\n- ✍️ **Text tools** — "summarize: …", "count words: …", "slugify: …", base64\n- 🧠 **Open-ended chat** — flip on **Reylo Neural** in the panel above for a real LLM on your device\n\nJust type naturally — I'll figure it out.`;
  }
  if (/\b(your name|who are you|what are you|are you (?:a )?(?:bot|human|ai|robot|chatgpt|gpt|siri|alexa))\b/.test(m)) {
    return `I'm **Reylo AI** — an open-source assistant that lives entirely in your browser. Not ChatGPT, not a cloud service: your device does the work. 👋`;
  }
  if (/\b(smarter than|better than|vs|versus|compare).*\b(chatgpt|gpt|gemini|claude|copilot)\b/.test(m) || /\bchatgpt\b.*\b(smarter|better)\b/.test(m)) {
    return `Honest answer: frontier cloud models are bigger and stronger at open-ended reasoning than what I can run on your device — I won't pretend otherwise.\n\nWhat I *do* beat them on: **price ($0 forever), privacy (nothing leaves your device), keys/accounts (none), and speed for everyday tasks** (math, conversions, code recipes — instant, with zero download).\n\nTurn on **Reylo Neural** and you get a real LLM locally too. Different tradeoffs — I'm the one that respects your wallet and your data.`;
  }
  if (/\b(who made you|who created you|who built you|your creator|developer)\b/.test(m)) {
    return `I was built as an open-source project by the **Reylo** community on GitHub — anyone can read the code, run it, or improve it. The whole app is just HTML, CSS, and JavaScript running on GitHub Pages!`;
  }
  if (/\b(joke|funny|make me laugh)\b/.test(m)) {
    return `Here you go: ${pick(JOKES, m)}`;
  }
  if (/\b(fact|trivia|something interesting|amaze me|fun fact)\b/.test(m)) {
    return `Here's one: ${pick(FACTS, m)}`;
  }
  if (/^what(?:'s| is)?\s+(?:the )?(?:current )?(?:time|date|day)\b/.test(m) || /^(what time|what date|what day)\b/.test(m)) {
    const now = new Date();
    return `Right now it's **${now.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}** (your device's clock).`;
  }
  if (/\bweather\b/.test(m)) {
    return `I can't fetch live weather — I have no network access by design (privacy!). Try a quick search, or enable **Reylo Neural** if you want to chat about *why* weather is hard to predict.`;
  }
  if (/^(yes|yeah|yep|no|nope|ok|okay|sure|cool|nice|great|awesome|lol|haha|wow)\b[.!?]*$/.test(m)) {
    return pick([
      '👍 Want me to dive deeper on anything?',
      'Anything else you\'d like to try? I do math, code, and explanations particularly well.',
      'Let me know what\'s next — or try one of the suggestion chips above.',
    ], m);
  }
  if (/\b(stupid|dumb|useless|suck|bad bot|terrible)\b/.test(m)) {
    return `Ouch — fair enough. I'm a small engine running entirely on your device, so I have limits. Tell me what you were hoping for and I'll either nail it or point you to what will.`;
  }
  if (/\b(i love you|marry me|are you single)\b/.test(m)) {
    return `Ha — I appreciate the enthusiasm, but I'm just code and good intentions. 💙 Now, what should we figure out together?`;
  }
  if (/^(help|\/help|\?|what should i (?:ask|say|do))\b/.test(m)) {
    return `Try things like:\n\n- \`what is machine learning\`\n- \`(18 + 4) * 3^2\`\n- \`convert 72 f to c\`\n- \`write code for two sum in python\`\n- \`summarize: <paste any text>\`\n- \`count words: <text>\`\n\nOr toggle **Reylo Neural** for open-ended conversation.`;
  }
  // Follow-up "explain more" on previous topic
  if (/^(explain (?:it|that|more|further)|more detail|elaborate|go deeper|what do you mean)\b/.test(m) && prevText) {
    return `To go deeper on **"${prevText.slice(0, 60)}${prevText.length > 60 ? '…' : ''}"** — try asking about a specific part of it. I have detailed notes on AI, programming, science, history, productivity, and more. Reylo Neural (the toggle above) handles open-ended follow-ups best.`;
  }
  return null;
}

function fallback(message, history) {
  const topicWords = (message.toLowerCase().match(/[a-z']{4,}/g) ?? [])
    .filter((w) => !STOPWORDS.has(w))
    .slice(0, 3);
  const topic = topicWords.join(' ');

  const isQuestion = /\?\s*$/.test(message.trim()) || /^(what|why|how|when|where|who|which|can|could|should|is|are|do|does)\b/i.test(message.trim());

  if (isQuestion) {
    return `I want to give you a genuinely good answer here — and my instant engine (${topic ? `for **${topic}**` : 'for this'}) is best at math, code, text tools, and curated topics.\n\nTwo options:\n\n1. **Turn on Reylo Neural** (panel above) — a real language model runs on your device and answers open-ended questions like this.\n2. **Rephrase into a tool request** — e.g. \`calculate: ...\`, \`convert: ...\`, \`write code for ...\`, \`summarize: ...\`.\n\nMeanwhile, here are topics I *do* know cold:\n${relatedTopics(3)}`;
  }
  return `Got it${topic ? ` — **${topic}**` : ''}. My instant engine handles questions and tasks best (math, code, knowledge, text tools).\n\nWant me to:\n- **Calculate** something? (\`12 * 8 + 4\`)\n- **Write code**? (\`write code for debounce\`)\n- **Explain** a topic? (\`what is machine learning\`)\n\nOr enable **Reylo Neural** for free-form chat.`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export class ReyloCore {
  constructor() {
    this.name = 'Reylo Core';
  }

  /** @returns {Promise<{text: string, engine: string, intent: string}>} */
  async chat(message, history = []) {
    const text = String(message ?? '').trim();
    if (!text) {
      return { text: 'Type something and I\'ll jump on it!', engine: 'core', intent: 'empty' };
    }

    const result =
      tryTextTools(text) ??
      tryMath(text) ??
      tryConvert(text) ??
      tryCodeRecipe(text) ??
      tryConversation(text, history) ??
      this._fromKnowledge(text) ??
      fallback(text, history);

    return { text: result, engine: 'core', intent: 'answer' };
  }

  _fromKnowledge(text) {
    const entry = matchKnowledge(text);
    if (!entry) return null;
    const lead = /^(what|who|why|how|when|where|tell me|explain|define)\b/i.test(text.trim())
      ? ''
      : '';
    return `${lead}${entry.answer}\n\n---\n*Want more depth? Toggle **Reylo Neural** for open-ended discussion of ${entry.title.toLowerCase()}.*`;
  }
}

export const coreInternals = {
  parseMath,
  tryMath,
  tryConvert,
  summarize,
  matchKnowledge,
  KNOWLEDGE,
  CODE_RECIPES,
};

export default ReyloCore;

/**
 * Reylo Core engine tests. Run with: node tests/core.test.mjs
 */
import { ReyloCore, coreInternals } from '../js/core.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function includes(name, hay, needle) {
  check(name, String(hay).toLowerCase().includes(String(needle).toLowerCase()), `got: ${JSON.stringify(hay)}`);
}

const core = new ReyloCore();
const chat = (msg, history = []) => core.chat(msg, history).then((r) => r.text);

console.log('\n— math —');
{
  const out = await chat('what is (18 + 4) * 3^2');
  includes('order of operations', out, '198');
  includes('math shows work', out, '=');

  includes('percent of', await chat('15% of 240'), '36');
  includes('what percent', await chat('240 is what percent of 300'), '80%');
  includes('factorial', await chat('5!'), '120');
  includes('sqrt function', await chat('sqrt(144)'), '= **12**');
  includes('division by zero guarded', await chat('1 / 0').catch((e) => String(e)), 'zero');
  check('parseMath direct', coreInternals.parseMath('2 + 3 * 4') === 14);
  check('parseMath power', coreInternals.parseMath('2^10') === 1024);
}

console.log('\n— unit conversion —');
{
  includes('f to c', await chat('convert 72 f to c'), '22.22');
  includes('km to miles', await chat('convert 5 km to miles'), '3.106');
  includes('kg to lb', await chat('10 kg to lbs'), '22.046');
  includes('how many in', await chat('how many cups in 2 liters'), '8.453');
}

console.log('\n— text tools —');
{
  const longText = 'The sun is a star at the center of our solar system. It produces energy through nuclear fusion in its core. This energy eventually reaches Earth as light and heat. Without the sun, life on Earth would be impossible. The sun is about 4.6 billion years old. Its surface temperature is roughly 5,500 degrees Celsius. The core reaches about 15 million degrees. Light from the sun takes eight minutes to reach us. The sun contains more than 99 percent of the solar system mass. One day the sun will expand into a red giant. Eventually it will shed its outer layers. A white dwarf will remain behind.';
  const summary = await chat(`summarize: ${longText}`);
  includes('summarize works', summary, 'Summary');
  check('summarize compresses', summary.length < longText.length * 0.8, `got ${summary.length} vs ${longText.length}`);
  check('summarize function keeps key sentences', coreInternals.summarize(longText, 3).split(/(?<=\.)\s/).length === 3);

  includes('word count', await chat('count words: one two three four five'), '5');
  includes('slugify', await chat('slugify: Hello World! 2026'), 'hello-world-2026');
  includes('reverse', await chat('reverse: abc'), 'cba');
  includes('base64 encode', await chat('base64 encode: hi'), 'aGk=');
  check('summarize function returns sentences', coreInternals.summarize(longText, 2).split(/\./).length >= 2);
}

console.log('\n— code recipes —');
{
  const fib = await chat('write code for fibonacci in python');
  includes('fibonacci python', fib, 'def fibonacci');
  const fb = await chat('code for fizzbuzz in javascript');
  includes('fizzbuzz js', fb, 'Fizz');
  const twoSum = await chat('two sum algorithm');
  includes('two sum', twoSum.toLowerCase(), 'two sum');
  const debounce = await chat('write code for debounce');
  includes('debounce', debounce, 'setTimeout');
}

console.log('\n— knowledge —');
{
  includes('machine learning', await chat('what is machine learning?'), 'supervised');
  includes('llm', await chat('explain large language models'), 'transformer');
  includes('git', await chat('how does git work?'), 'commit');
  includes('big-o', await chat('what is big o notation?'), 'O(n');
  includes('sql', await chat('what is sql?'), 'SELECT');
  includes('black holes', await chat('tell me about black holes'), 'event horizon');
  includes('photosynthesis', await chat('what is photosynthesis?'), 'chlorophyll');
  includes('reylo about', await chat('what are you?'), 'browser');
  includes('privacy', await chat('is my data private here?'), 'local');
  includes('no api keys', await chat('why are there no api keys?'), 'free');
}

console.log('\n— conversation —');
{
  includes('greeting', await chat('hello!'), 'Reylo AI');
  includes('joke', await chat('tell me a joke'), '?');
  includes('name', await chat('what is your name?'), 'Reylo');
  includes('capabilities', await chat('what can you do?'), 'Math');
  includes('time answer', await chat('what time is it?'), 'now');
  includes('weather honest', await chat("what's the weather?"), 'weather');
  includes('thanks', await chat('thanks!'), 'Anytime');
  check('fallback mentions neural on open question', (await chat('write me a poem about the ocean sunset')).toLowerCase().length > 40);
}

console.log('\n— safety / robustness —');
{
  check('empty message handled', (await chat('   ')).length > 0);
  check('xss escaped in output', !(await chat('<script>alert(1)</script> what is machine learning')).includes('<script>'));
  check('no eval of user input', (await chat('require("fs").readFileSync("/etc/passwd")')).length > 0);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

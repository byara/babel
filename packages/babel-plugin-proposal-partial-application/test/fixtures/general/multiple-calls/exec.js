function add(a, b) {
  return a + b;
}

function square(x){
  return x * x;
}

const foo = add(?, 1);
const bar = square(?);

expect(bar(foo(2))).toBe(9);

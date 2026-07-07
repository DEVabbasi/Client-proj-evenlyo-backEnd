const toMoney = (value) => {
  console.log(value,"valuevaluevaluevalue");
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { toMoney };

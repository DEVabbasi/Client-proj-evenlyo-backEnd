const toMoney = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { toMoney };

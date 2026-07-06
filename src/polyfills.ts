if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value(index: number) {
      const length = this.length >>> 0;
      const relativeIndex = Math.trunc(index) || 0;
      const normalizedIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;

      if (normalizedIndex < 0 || normalizedIndex >= length) return undefined;
      return this[normalizedIndex];
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

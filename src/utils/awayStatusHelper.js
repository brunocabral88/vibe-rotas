const AWAY_KEYWORDS = ['away', 'vacation', 'ooo', 'holiday', 'sick', 'leave'];
const AWAY_EMOJI_PREFIXES = ['plane'];
const AWAY_EMOJIS = new Set(['beach_with_umbrella', 'palm_tree', 'airplane']);

function normalizeEmoji(statusEmoji = '') {
  return statusEmoji.replace(/:/g, '').trim().toLowerCase();
}

function findAwayMatch(statusText = '', statusEmoji = '') {
  const normalizedText = statusText.trim().toLowerCase();
  const normalizedEmoji = normalizeEmoji(statusEmoji);

  const keyword = AWAY_KEYWORDS.find((item) => normalizedText.includes(item));
  if (keyword) {
    return {
      isAway: true,
      matchType: 'keyword',
      matchValue: keyword
    };
  }

  if (normalizedEmoji && AWAY_EMOJIS.has(normalizedEmoji)) {
    return {
      isAway: true,
      matchType: 'emoji',
      matchValue: normalizedEmoji
    };
  }

  const emojiPrefix = AWAY_EMOJI_PREFIXES.find((prefix) => normalizedEmoji.startsWith(prefix));
  if (normalizedEmoji && emojiPrefix) {
    return {
      isAway: true,
      matchType: 'emoji_prefix',
      matchValue: emojiPrefix
    };
  }

  return {
    isAway: false,
    matchType: null,
    matchValue: null
  };
}

module.exports = {
  findAwayMatch
};

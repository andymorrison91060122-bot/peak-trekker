export const IN_PROGRESS_QUOTES = [
  {
    text: '登山不在于爬得多高，而在于走得多稳，在于路上的每一步。',
    author: 'Edmund Hillary',
  },
  {
    text: '因为山就在那里，而我正在去往它的路上。',
    author: 'George Mallory',
  },
  {
    text: '攀登的魅力，不在于最终站在顶峰，而在于向上攀登的每一步过程。',
    author: 'Reinhold Messner',
  },
  {
    text: '登山不是为了到达顶峰，而是为了享受在路上的每一刻。',
    author: 'Jimmy Chin',
  },
  {
    text: '山不会走向你，你必须一步一步，走向它。',
    author: 'Walter Bonatti',
  },
  {
    text: '山一直在那里，而我们的故事，永远写在奔赴它的路上。',
    author: '罗静',
  },
  {
    text: '路漫漫其修远兮，吾将上下而求索。',
    author: '屈原《离骚》',
  },
  {
    text: '路虽远，行则将至；事虽难，做则必成。',
    author: '《荀子・修身》',
  },
] as const

export const SUMMIT_QUOTES = [
  {
    text: '会当凌绝顶，一览众山小。',
    author: '杜甫《望岳》',
  },
  {
    text: '你必须去走属于自己的路，因为只有在向上攀登的路上，你才能真正看清世界。',
    author: 'Reinhold Messner',
  },
  {
    text: '世之奇伟、瑰怪，非常之观，常在于险远，而人之所罕至焉。',
    author: '王安石《游褒禅山记》',
  },
  {
    text: '顶峰的风景再好，也抵不过一步一步走上来的路。所有的答案，都在你攀登的每一步里，而顶峰，是最好的答案。',
    author: '竹内洋岳',
  },
  {
    text: '站在顶峰的那一刻，所有的疲惫、恐惧都烟消云散。剩下的，只有对山野的敬畏，和对自己的全然认可。',
    author: 'Anatoli Boukreev',
  },
  {
    text: '登山的终点，从来不是顶峰，而是当你站在顶峰，终于明白自己为何出发。',
    author: 'Walter Bonatti',
  },
  {
    text: '飞步凌绝顶，极目无纤烟。',
    author: '李白《登峨眉山》',
  },
  {
    text: '登高壮观天地间，大江茫茫去不还。',
    author: '李白《庐山谣寄卢侍御虚舟》',
  },
  {
    text: '天高地迥，觉宇宙之无穷。',
    author: '王勃《滕王阁序》',
  },
  {
    text: '世上无难事，只要肯登攀。',
    author: '毛泽东《水调歌头・重上井冈山》',
  },
  {
    text: '到无边天作岸，山登绝顶我为峰。',
    author: '林则徐《出老》',
  },
  {
    text: '不畏浮云遮望眼，自缘身在最高层。',
    author: '王安石《登飞来峰》',
  },
] as const

export function getRandomQuote(isSummit: boolean) {
  const pool = isSummit ? SUMMIT_QUOTES : IN_PROGRESS_QUOTES
  return pool[Math.floor(Math.random() * pool.length)]
}

import { Post } from "../app/models/post.ts";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000);

type Seed = {
  title: string;
  body: string;
  published: boolean;
  daysAgo: number;
  comments: [author: string, body: string, hoursLater: number][];
};

const posts: Seed[] = [
  {
    title: "Three days on the Wonderland Trail, counterclockwise",
    body: `We started at Longmire on a Thursday with permits for Devil's Dream, Klapatche Park and Golden Lakes, which is a lot of miles for three days but the forecast was perfect and we didn't want to waste it.

Day one was mostly climbing out of the Nisqually and crossing the suspension bridge at Tahoma Creek, which bounces more than the photos suggest. Indian Henry's Hunting Ground was in full bloom: lupine, paintbrush, and a marmot that sat on the trail and refused to move for ten minutes.

Day two was the long one. The washout above the South Puyallup is still there, so budget extra time and keep your poles stowed for the scramble. Klapatche Park at sunset, with the mountain reflected in Aurora Lake, was the best campsite I've had in years.

Gear note: the new stove is great, but bring a backup lighter. The igniter quit at 5,000 feet.`,
    published: true,
    daysAgo: 2,
    comments: [
      [
        "Priya N.",
        "Klapatche at sunset is unreal. Did you have any trouble getting the permit, or was it a walk-up?",
        3,
      ],
      [
        "Marcus",
        "The South Puyallup washout got me last year too. Good call on stowing the poles.",
        9,
      ],
      [
        "Dana Whitfield",
        "Counterclockwise or not, three days is fast. How were your knees on the descent to the Carbon?",
        26,
      ],
    ],
  },
  {
    title: "Gear list: what I actually carried this summer",
    body: `Base weight came in at 14.2 lb, down from 19 last year. Most of that was the tent (a trekking-pole shelter instead of a freestanding dome) and leaving the camp chair at home, which I regret about once per trip.

What earned its place: a 20°F quilt, a foam sit pad that doubles as a pillow stuff, and a small filter with a gravity bag. What didn't: the solar charger. It never charged anything under tree cover.

Full spreadsheet is on my desk at home; I'll post it once I clean it up.`,
    published: true,
    daysAgo: 9,
    comments: [
      ["Sam Ortega", "Trekking-pole shelters are a game changer. Which one did you go with?", 4],
      [
        "Lin",
        "Agree on the solar charger. A 10,000 mAh battery has been plenty for me for four nights.",
        30,
      ],
    ],
  },
  {
    title: "Snow on Cascade Pass in July",
    body: `Plenty of it, mostly above the last switchback. Microspikes were enough on the morning crust, but by noon it was soft enough to posthole up to the knee on the way down.

The road to the trailhead is open and the lot was full by 7:30 on a Saturday. Ranger at Marblemount said the Sahale Arm is still a no for anyone without an axe.`,
    published: true,
    daysAgo: 17,
    comments: [
      ["Marcus", "Thanks for the conditions report, this is exactly what I was looking for.", 2],
      ["Hannah K.", "Went up the next day. Can confirm the postholing. Bring gaiters!", 22],
      ["Priya N.", "Is the bridge at the Stehekin end of the road back in?", 40],
      ["Ellis", "Bridge is in as of last week. Bus is running twice a day.", 47],
    ],
  },
  {
    title: "A rainy weekend at Lake Ingalls (and why we turned around)",
    body: `Sometimes the right call is the short one. Clouds were sitting on the ridge from the moment we left the trailhead, and by the time we reached Ingalls Pass it was sideways rain and forty-foot visibility.

We had lunch behind a boulder, watched two mountain goats ignore the weather entirely, and walked back down. No lake, no Stuart view, but nobody was hypothermic either.

We'll be back in October for the larches.`,
    published: true,
    daysAgo: 31,
    comments: [
      [
        "Dana Whitfield",
        "Turning around is always the right call when you're asking whether it is. Larches in October will be worth it.",
        6,
      ],
    ],
  },
  {
    title: "Leave No Trace, revisited",
    body: `A short post after finding three fire rings at an established campsite where fires have been banned since 2019. Pack out your toilet paper, camp on durable surfaces, and please don't build new rings.

If you see a ring at a no-fires site, scatter the rocks and the cold ash. It takes two minutes and it keeps the next group from assuming it's allowed.`,
    published: true,
    daysAgo: 45,
    comments: [],
  },
  {
    title: "Draft: winter trip planning",
    body: `Thinking about a snowshoe overnight at Mazama Ridge in January. Need to rent an avalanche beacon and take the refresher course first.

To do:
- check the NWAC forecast pattern for the last three winters
- ask Dana about the route above Paradise
- figure out whether the 0°F bag is actually warm enough`,
    published: false,
    daysAgo: 1,
    comments: [],
  },
];

for (const seed of posts) {
  const createdAt = ago(seed.daysAgo);
  const post = await Post.create({
    title: seed.title,
    body: seed.body,
    published: seed.published,
    created_at: createdAt,
    updated_at: createdAt,
  });
  for (const [author, body, hoursLater] of seed.comments) {
    const at = new Date(createdAt.getTime() + hoursLater * 60 * 60 * 1000);
    await post.comments.create({ author, body, created_at: at, updated_at: at });
  }
}

console.log(`Seeded ${posts.length} posts.`);

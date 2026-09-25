# Arcfire balance sweep — first run (Plan 2B Task 15)

The first `BALANCE_SWEEP=1` run of the Plan 2B sweep, before any tuning, exactly as `src/game/test/arcfire/arcfire.sweep.test.ts` wrote it to `test-results/arcfire-balance/report.md`. The harness plays seeds 1..400, Ace vs Ace, with a random draft and `STANDARD_SETTINGS`; tier separation plays 200 seeds a pairing with power drafts. Every count is seed-determined; only the cost table's ms column depends on the machine and its load.

The 9 failing weapons are acknowledged in `src/game/titles/arcfire/balance.allow.json` (owner decision B5, design ⚑ O10), so the weekly job reports them as ACK and stays green until the tuning pass (⚑ O11) empties the list. The launch gate needs the list empty. No `power` was written back (⚑ O9).

The suggestion column follows spec §4.3's rule: a plain damage scaling when the hit rate is at least 80%. For a multi-shell or multi-beam weapon that rule can print a scaling where the fix is structural. Prism's row suggests damage × 2.12, but only one beam of its three reaches, so the tuning default (⚑ O11, spec §9.1) is a narrower spread or more damage a beam, as its allow-list reason says.

## Arcfire sweeps
tier separation (200 seeds each): Ace-Rookie 99.5% (>= 85%), Ace-Veteran 93.5% (>= 60%), Veteran-Rookie 85.5% (>= 70%)

### Balance: Ace vs Ace, random draft, STANDARD_SETTINGS

400 matches; player 0 won 218, the first shooter 211, draws 1; mean |margin| 112.4

| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pulse | 1 | 27.6 | 15-40 | 15.5 | 83 | 0.0 | -0.4 +- 6.2 | 14.9 | ok |  | 28 | 100 |  |
| pulse2 | 2 | 47.7 | 30-60 | 18.6 | 93 | 0.0 | +0.8 +- 6.2 | 9.0 | ok |  | 48 | 100 |  |
| nova | 3 | 90.5 | 50-90 | 19.2 | 98 | 0.0 | +12.0 +- 6.1 | 3.5 | HIGH+WR | FAIL | 90 | 100 | damage x 0.77 (to the band's middle, 70); reduce damage or spread: win-rate contribution +12.0% +- 6.1 |
| needle | 2 | 78.6 | 30-60 | 47.7 | 75 | 0.0 | +4.3 +- 6.1 | 3.5 | HIGH | FAIL | 79 | 100 | structural: hit 75%, 104.7 points on a hit |
| crater | 1 | 21.0 | 15-40 | 6.5 | 96 | 0.0 | -9.8 +- 6.2 | 17.1 | ok |  | 21 | 39 |  |
| triad | 1 | 39.7 | 15-40 | 23.3 | 91 | 0.0 | -5.7 +- 6.1 | 12.7 | ok |  | 40 | 100 |  |
| fan | 2 | 44.2 | 30-60 | 28.7 | 92 | 0.0 | -5.2 +- 6.2 | 11.2 | ok |  | 44 | 100 |  |
| railshot | 2 | 27.6 | 30-60 | 35.7 | 38 | 0.0 | -0.2 +- 6.2 | 14.7 | LOW | FAIL | 28 | 97 | structural: hit 38%, 72.5 points on a hit |
| twinnova | 3 | 104.3 | 50-90 | 22.6 | 99 | 0.0 | +17.3 +- 6.2 | 2.3 | HIGH+WR | FAIL | 100 | 100 | damage x 0.67 (to the band's middle, 70); reduce damage or spread: win-rate contribution +17.3% +- 6.2 |
| cascade | 3 | 54.7 | 50-90 | 45.7 | 92 | 0.0 | +5.0 +- 6.0 | 9.6 | ok |  | 55 | 100 |  |
| hydra | 3 | 50.9 | 50-90 | 22.0 | 98 | 0.0 | +1.4 +- 6.1 | 10.5 | ok |  | 51 | 100 |  |
| hailstorm | 2 | 42.2 | 30-60 | 19.6 | 99 | 0.0 | -1.4 +- 6.1 | 11.5 | ok |  | 42 | 100 |  |
| shrapnel | 2 | 24.4 | 30-60 | 12.9 | 95 | 0.0 | -5.3 +- 6.2 | 15.7 | LOW | FAIL | 24 | 72 | damage x 1.84 (to the band's middle, 45) |
| barrage | 2 | 31.3 | 30-60 | 12.9 | 100 | 0.0 | -6.5 +- 6.0 | 13.4 | ok |  | 31 | 100 |  |
| skipper | 2 | 26.5 | 30-60 | 10.3 | 95 | 0.0 | +0.8 +- 6.3 | 15.3 | LOW | FAIL | 27 | 85 | damage x 1.70 (to the band's middle, 45) |
| pinball | 2 | 50.8 | 30-60 | 13.7 | 94 | 0.0 | +5.2 +- 6.4 | 8.5 | ok |  | 51 | 100 |  |
| ricochet | 1 | 31.2 | 15-40 | 13.1 | 92 | 0.0 | +1.7 +- 6.4 | 13.0 | ok |  | 31 | 100 |  |
| tumbler | 1 | 35.3 | 15-40 | 10.8 | 94 | 0.0 | -6.3 +- 6.4 | 12.4 | ok |  | 35 | 100 |  |
| juggernaut | 3 | 83.6 | 50-90 | 7.4 | 100 | 0.0 | +8.6 +- 6.2 | 4.1 | ok |  | 84 | 100 |  |
| burrow | 2 | 44.5 | 30-60 | 20.7 | 84 | 0.0 | +0.2 +- 6.3 | 11.2 | ok |  | 45 | 100 |  |
| auger | 2 | 11.5 | 30-60 | 8.6 | 70 | 0.0 | -6.1 +- 6.2 | 18.1 | LOW | FAIL | 12 | 0 | structural: hit 70%, 16.4 points on a hit |
| inferno | 3 | 66.1 | 50-90 | 16.1 | 94 | 0.0 | +6.0 +- 6.4 | 6.8 | ok |  | 66 | 100 |  |
| wildfire | 2 | 40.1 | 30-60 | 14.0 | 89 | 0.0 | -0.6 +- 6.1 | 11.5 | ok |  | 40 | 100 |  |
| rampart | 1 | - | WR only | - | - | 0.0 | -11.2 +- 5.9 | 12.4 | ok |  | 10 | 0 | 125 defensive uses, estimated reply cut 39.4 |
| bastion | 1 | - | WR only | - | - | 0.0 | -7.9 +- 5.9 | 14.7 | ok |  | 20 | 0 | 96 defensive uses, estimated reply cut 37.2 |
| leveler | 1 | - | WR only | - | - | 0.0 | -17.3 +- 5.9 | 12.0 | ok |  | 1 | 0 | 142 defensive uses, estimated reply cut 38.9 |
| lancer | 2 | 59.2 | 30-60 | 6.7 | 99 | 0.0 | +5.4 +- 6.3 | 6.6 | ok |  | 59 | 100 |  |
| prism | 3 | 33.1 | 50-90 | 7.9 | 95 | 0.0 | +1.3 +- 6.3 | 14.8 | LOW | FAIL | 33 | 100 | damage x 2.12 (to the band's middle, 70) |
| seeker | 2 | 50.0 | 30-60 | 0.0 | 100 | 0.0 | +0.8 +- 6.2 | 7.9 | ok |  | 50 | 100 |  |
| swarm | 3 | 93.0 | 50-90 | 12.0 | 100 | 0.0 | +15.9 +- 6.5 | 3.3 | HIGH+WR | FAIL | 93 | 100 | damage x 0.75 (to the band's middle, 70); reduce damage or spread: win-rate contribution +15.9% +- 6.5 |
| quake | 2 | 52.6 | 30-60 | 3.8 | 100 | 0.0 | -2.4 +- 6.1 | 7.3 | ok |  | 53 | 100 |  |
| aftershock | 3 | 75.8 | 50-90 | 16.2 | 100 | 0.0 | +5.7 +- 6.4 | 5.3 | ok |  | 76 | 100 |  |

FAIL (9): nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm; ACK (0): none; STALE ACK: none

Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):

| tier | decisions | sims mean / max | probe flights mean / max | ms mean / p99 / max (under the sweep's load) |
|---|---|---|---|---|
| rookie | 4000 | 144 / 300 | 564 / 1737 | 12.9 / 32.7 / 409.6 |
| veteran | 4000 | 651 / 1200 | 3559 / 9357 | 68.3 / 153.3 / 3388.8 |
| ace | 12004 | 2123 / 3700 | 21773 / 49900 | 287.6 / 1136.6 / 5894.9 |

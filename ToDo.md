# NFL Draft Helper Todo

Add Changelog

## League page
* owners box


## Stats page

Check w/ show non 12 teams
1qb/2qb

- MY
  Per draft position: Count, average position, no1

- General
- Per draft position: Average position, no1

H2H




adp code:
Adp:
{(() => {
if (!scoringType) return "-";
const position = player.position;
const isDynasty = scoringType.toLowerCase().includes("dynasty");
const isHalfPpr = scoringType.toLowerCase().includes("half_ppr");

                              let adpRank;
                              if (isDynasty) {
                                adpRank = player.adp_dynasty_2qb_rank;
                              } else if (isHalfPpr) {
                                adpRank = player.adp_half_ppr_rank;
                              } else {
                                adpRank = player.adp_ppr_rank;
                              }

                              return adpRank ? ` ${adpRank}` : "-";
                            })()}
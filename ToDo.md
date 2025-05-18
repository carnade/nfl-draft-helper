# NFL Draft Helper Todo

## Portfolio

## DraftGrid

- Add points for bestball
- Toggle points/value for dynasty
- Cameron Ward

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

## Stats page

-


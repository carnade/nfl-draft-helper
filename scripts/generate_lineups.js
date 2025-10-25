const fs = require('fs');

// DFS lineup generator
class DFSLineupGenerator {
  constructor() {
    this.SALARY_CAP = 50000;
    this.REQUIRED_POSITIONS = {
      QB: 1,
      RB: 2,
      WR: 3,
      TE: 1,
      DST: 1,
      FLEX: 1 // Can be RB, WR, or TE
    };
  }

  // Fetch current week and player data
  async fetchData() {
    try {
      // Get current NFL week
      const weekResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
      const weekData = await weekResponse.json();
      const currentWeek = weekData.week;

      // Get DFS salaries
      const salariesResponse = await fetch(`https://shaggy-latashia-carnade-2ea2054a.koyeb.app/dfs-salaries/week/${currentWeek}`);
      const salariesData = await salariesResponse.json();

      // Transform data
      const players = Object.values(salariesData).map(player => ({
        name: player.name,
        position: player.position,
        team: player.team,
        salary: player.salary,
        sleeper_id: player.sleeper_id,
        game_date: player.game_date,
        projected_points: player.projected_points,
        value_proj: player.value_proj
      }));

      return { players, currentWeek };
    } catch (error) {
      console.error('Error fetching data:', error);
      return null;
    }
  }

  // Filter players by position and availability
  getPlayersByPosition(players, position) {
    const now = new Date();
    return players.filter(player => {
      // Check if player has already played
      if (player.game_date) {
        const gameDate = new Date(player.game_date);
        if (gameDate < now) return false;
      }
      return player.position === position;
    });
  }

  // Generate a valid lineup
  generateLineup(players, excludePlayers = new Set()) {
    const lineup = {
      QB: null,
      RB1: null,
      RB2: null,
      WR1: null,
      WR2: null,
      WR3: null,
      TE: null,
      FLEX: null,
      DST: null
    };

    const usedPlayers = new Set();
    let totalSalary = 0;

    // Helper function to select best available player
    const selectPlayer = (positionPlayers, maxSalary = Infinity, randomize = false) => {
      const available = positionPlayers.filter(p => 
        !usedPlayers.has(p.sleeper_id) && 
        !excludePlayers.has(p.sleeper_id) &&
        totalSalary + p.salary <= this.SALARY_CAP &&
        totalSalary + p.salary <= maxSalary
      );
      
      if (available.length === 0) return null;
      
      if (randomize) {
        // Randomly select from top 3 options
        available.sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
        const topOptions = available.slice(0, Math.min(3, available.length));
        return topOptions[Math.floor(Math.random() * topOptions.length)];
      } else {
        // Sort by value projection (higher is better)
        available.sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
        return available[0];
      }
    };

    // Select QB
    const qbs = this.getPlayersByPosition(players, 'QB');
    lineup.QB = selectPlayer(qbs, Infinity, true); // Randomize QB selection
    if (!lineup.QB) return null;
    usedPlayers.add(lineup.QB.sleeper_id);
    totalSalary += lineup.QB.salary;

    // Select RB1
    const rbs = this.getPlayersByPosition(players, 'RB');
    lineup.RB1 = selectPlayer(rbs, Infinity, true); // Randomize RB1 selection
    if (!lineup.RB1) return null;
    usedPlayers.add(lineup.RB1.sleeper_id);
    totalSalary += lineup.RB1.salary;

    // Select RB2
    lineup.RB2 = selectPlayer(rbs, Infinity, true); // Randomize RB2 selection
    if (!lineup.RB2) return null;
    usedPlayers.add(lineup.RB2.sleeper_id);
    totalSalary += lineup.RB2.salary;

    // Select WR1
    const wrs = this.getPlayersByPosition(players, 'WR');
    lineup.WR1 = selectPlayer(wrs, Infinity, true); // Randomize WR1 selection
    if (!lineup.WR1) return null;
    usedPlayers.add(lineup.WR1.sleeper_id);
    totalSalary += lineup.WR1.salary;

    // Select WR2
    lineup.WR2 = selectPlayer(wrs, Infinity, true); // Randomize WR2 selection
    if (!lineup.WR2) return null;
    usedPlayers.add(lineup.WR2.sleeper_id);
    totalSalary += lineup.WR2.salary;

    // Select WR3
    lineup.WR3 = selectPlayer(wrs, Infinity, true); // Randomize WR3 selection
    if (!lineup.WR3) return null;
    usedPlayers.add(lineup.WR3.sleeper_id);
    totalSalary += lineup.WR3.salary;

    // Select TE
    const tes = this.getPlayersByPosition(players, 'TE');
    lineup.TE = selectPlayer(tes, Infinity, true); // Randomize TE selection
    if (!lineup.TE) return null;
    usedPlayers.add(lineup.TE.sleeper_id);
    totalSalary += lineup.TE.salary;

    // Select FLEX (best remaining RB, WR, or TE)
    const flexCandidates = [
      ...rbs.filter(p => !usedPlayers.has(p.sleeper_id)),
      ...wrs.filter(p => !usedPlayers.has(p.sleeper_id)),
      ...tes.filter(p => !usedPlayers.has(p.sleeper_id))
    ];
    lineup.FLEX = selectPlayer(flexCandidates, Infinity, true); // Randomize FLEX selection
    if (!lineup.FLEX) return null;
    usedPlayers.add(lineup.FLEX.sleeper_id);
    totalSalary += lineup.FLEX.salary;

    // Select DST
    const dsts = this.getPlayersByPosition(players, 'DST');
    lineup.DST = selectPlayer(dsts, Infinity, true); // Randomize DST selection
    if (!lineup.DST) return null;
    usedPlayers.add(lineup.DST.sleeper_id);
    totalSalary += lineup.DST.salary;

    return { lineup, totalSalary };
  }

  // Generate multiple lineups with different strategies
  async generateLineups() {
    const data = await this.fetchData();
    if (!data) return;

    const { players, currentWeek } = data;
    const lineups = [];
    const usedLineups = new Set();

    // Helper function to check if lineup is unique
    const isUniqueLineup = (lineup) => {
      const lineupKey = [
        lineup.QB?.sleeper_id,
        lineup.RB1?.sleeper_id,
        lineup.RB2?.sleeper_id,
        lineup.WR1?.sleeper_id,
        lineup.WR2?.sleeper_id,
        lineup.WR3?.sleeper_id,
        lineup.TE?.sleeper_id,
        lineup.FLEX?.sleeper_id,
        lineup.DST?.sleeper_id
      ].join('-');
      
      if (usedLineups.has(lineupKey)) return false;
      usedLineups.add(lineupKey);
      return true;
    };

    // Strategy 1-3: Balanced lineups (sorted by value projection)
    const balancedPlayers = [...players].sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
    for (let i = 0; i < 3; i++) {
      const result = this.generateLineup(balancedPlayers);
      if (result && isUniqueLineup(result.lineup)) {
        lineups.push({
          strategy: 'Balanced',
          lineup: result.lineup,
          totalSalary: result.totalSalary,
          remainingSalary: this.SALARY_CAP - result.totalSalary
        });
      }
    }

    // Strategy 4-6: Value-focused lineups (lower salary players)
    const valuePlayers = players.filter(p => p.salary < 6000).sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
    for (let i = 0; i < 3; i++) {
      const result = this.generateLineup(valuePlayers);
      if (result && isUniqueLineup(result.lineup)) {
        lineups.push({
          strategy: 'Value',
          lineup: result.lineup,
          totalSalary: result.totalSalary,
          remainingSalary: this.SALARY_CAP - result.totalSalary
        });
      }
    }

    // Strategy 7-9: High-salary lineups (stars and scrubs)
    const starPlayers = players.filter(p => p.salary > 7000).sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
    for (let i = 0; i < 3; i++) {
      const result = this.generateLineup(starPlayers);
      if (result && isUniqueLineup(result.lineup)) {
        lineups.push({
          strategy: 'Stars & Scrubs',
          lineup: result.lineup,
          totalSalary: result.totalSalary,
          remainingSalary: this.SALARY_CAP - result.totalSalary
        });
      }
    }

    // Strategy 10-12: Random lineups with different random seeds
    for (let i = 0; i < 3; i++) {
      const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
      const result = this.generateLineup(shuffledPlayers);
      if (result && isUniqueLineup(result.lineup)) {
        lineups.push({
          strategy: 'Random',
          lineup: result.lineup,
          totalSalary: result.totalSalary,
          remainingSalary: this.SALARY_CAP - result.totalSalary
        });
      }
    }

    return { lineups, currentWeek };
  }

  // Format lineup as DFS code
  formatLineupCode(lineup, username = 'Generated') {
    const players = [
      lineup.QB,
      lineup.RB1,
      lineup.RB2,
      lineup.WR1,
      lineup.WR2,
      lineup.WR3,
      lineup.TE,
      lineup.FLEX,
      lineup.DST
    ].filter(p => p);

    const lineupString = players.map(p => `${p.sleeper_id}-${p.salary}`).join(',');
    const encoded = Buffer.from(lineupString).toString('base64');
    return `${username}:${encoded}`;
  }

  // Generate output file
  async generateOutputFile() {
    const data = await this.fetchData();
    if (!data) return;

    const { players, currentWeek } = data;
    
    let output = `# DFS Lineup Codes - Week ${currentWeek}\n`;
    output += `# Generated on: ${new Date().toLocaleString()}\n\n`;

    // Generate exactly 12 lineups
    const targetLineups = 12;
    let generatedCount = 0;
    let attempt = 0;
    const maxAttempts = 50; // Prevent infinite loop
    const usedLineups = new Set();

    while (generatedCount < targetLineups && attempt < maxAttempts) {
      attempt++;
      
      // Try different strategies to get variety
      let strategyPlayers;
      if (attempt <= 4) {
        strategyPlayers = [...players].sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
      } else if (attempt <= 8) {
        strategyPlayers = players.filter(p => p.salary < 6000).sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
      } else if (attempt <= 12) {
        strategyPlayers = players.filter(p => p.salary > 7000).sort((a, b) => (b.value_proj || 0) - (a.value_proj || 0));
      } else {
        strategyPlayers = [...players].sort(() => Math.random() - 0.5);
      }

      // Create a set of already used players to exclude
      const excludePlayers = new Set();
      usedLineups.forEach(lineupKey => {
        const playerIds = lineupKey.split('-');
        playerIds.forEach(id => excludePlayers.add(id));
      });

      const result = this.generateLineup(strategyPlayers, excludePlayers);
      if (result) {
        // Check if lineup is unique
        const lineupKey = [
          result.lineup.QB?.sleeper_id,
          result.lineup.RB1?.sleeper_id,
          result.lineup.RB2?.sleeper_id,
          result.lineup.WR1?.sleeper_id,
          result.lineup.WR2?.sleeper_id,
          result.lineup.WR3?.sleeper_id,
          result.lineup.TE?.sleeper_id,
          result.lineup.FLEX?.sleeper_id,
          result.lineup.DST?.sleeper_id
        ].join('-');
        
        if (!usedLineups.has(lineupKey)) {
          usedLineups.add(lineupKey);
          const lineupCode = this.formatLineupCode(result.lineup, `Lineup${generatedCount + 1}`);
          output += `${lineupCode}\n`;
          generatedCount++;
        }
      }
    }

    // Write to file
    fs.writeFileSync('generated_lineups.txt', output);
    console.log(`Generated ${generatedCount} lineup codes saved to generated_lineups.txt`);
    
    return output;
  }
}

// Run the generator
async function main() {
  const generator = new DFSLineupGenerator();
  await generator.generateOutputFile();
}

main().catch(console.error);

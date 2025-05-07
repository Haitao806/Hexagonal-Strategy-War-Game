Hexagonal Strategy War Game
A turn-based strategy game based on a hexagonal grid where players can choose different countries to engage in warfare.

Core Gameplay
Game Flow
Faction Selection:
Before the game begins, players choose one of four factions to control: US, ROK, DPRK, or PLA.

Initial Deployment:
Each faction starts in a predefined area on the map with a specific number of initial units.

Turn-Based Actions:

The game progresses in a turn-based manner (US -> ROK -> DPRK -> PLA -> US...).

The currently active faction is indicated on the interface. The player controls their selected faction, while the remaining factions are AI-controlled.

During a unit's turn, it can perform one of the following actions: Move or Attack.

Once a unit has acted (moved or attacked), it cannot act again during the same turn.

Newly generated or merged units cannot act in the turn they were created; they must wait until the next turn.

End Turn:
When all units of the current faction have acted, or the player decides to stop, they click the End Turn button, passing control to the next faction.

Unit Operations
Select Unit:

Click on a unit belonging to the currently active faction to select it.

Only units that haven't moved or attacked yet, and are not newly generated, can be selected.

When selected, the map highlights its movable range and attackable enemy units.

Move Unit:

After selecting a unit, click on a highlighted green tile within its movement range to move it there.

Units cannot move to occupied tiles (by any unit, ally or enemy) or onto Rocky terrain.

Capture Mechanic:

When a unit moves to a neutral or enemy-controlled tile, it captures that tile, changing its color to the faction's color.

If the captured tile is neutral, and there are open tiles (not rocky, not occupied) around it, a new Infantry unit is spawned on a random valid adjacent tile. The newly generated unit cannot act until the next turn.

Attack Unit:

After selecting a unit, if there are enemy units within its attack range, they will be highlighted in red.

Click on the highlighted enemy unit to attack.

Damage is calculated based on the attacker's Attack Power and the defender's Defense Power. Forest terrain reduces the damage received by the defender.

Attacking consumes the unit's action for that turn.

Map and Terrain
Map Size: 10 rows × 15 columns of hexagonal grids.

Initial Control: Each faction starts with 8 preoccupied tiles on the map.

Faction Colors:

United States (US): Dark Blue

South Korea (ROK): Bright Red

North Korea (DPRK): Medium Green

China (PLA): Golden Yellow

Terrain Types:

Plain: Default terrain, no special effects.

Forest: Units in forests take reduced damage when defending.

Rocky: Dark gray; completely blocks movement and attacks. Units cannot stand on rocky tiles, nor can merging occur on them.

Water: Visual element; units behave like they are on plains unless specific rules are added later.

Unit Details
The game features three basic unit types with the following attributes:

Infantry
Health: 10

Attack Power: 10

Defense Power: 2

Movement Range: 7 tiles

Attack Range: 1 tile

Tank
Health: 500

Attack Power: 100

Defense Power: 10

Movement Range: 2 tiles

Attack Range: 3 tiles

Artillery
Health: 20

Attack Power: 500

Defense Power: 5

Movement Range: 1 tile

Attack Range: 6 tiles

Unit Merging Logic
Players can merge certain types of units to create more powerful ones. Merging checks are triggered after unit movement.

Infantry → Tank:

Condition: When an infantry moves, if the central tile and all six adjacent tiles contain at least 5 Infantry units of the same faction.

Result: These 5 Infantry units are consumed, and 1 Tank is generated at the central tile.

Restriction: The central tile cannot be a Rocky terrain.

Tank → Artillery:

Condition: When a tank moves, if the central tile and all six adjacent tiles contain at least 3 Tanks of the same faction.

Result: These 3 Tanks are consumed, and 1 Artillery is generated at the central tile.

Restriction: The central tile cannot be a Rocky terrain.

Note:

Merged units are considered newly generated and cannot act during the turn they were created. They must wait until the next faction's turn.

Victory Conditions
Main Victory Condition: When only one faction remains on the battlefield, that faction is declared the winner.

Draw: If all factions are eliminated, the game ends in a draw.

Faction Elimination Notice:

If all units of a faction are eliminated, a notification will be displayed.

If all units and territories of a faction are lost, a message of "Complete Annihilation" will appear. This is for informational purposes and does not affect the win condition.

Controls and UI
Select Unit: Click on a friendly unit.

Move: Once selected, click on a green-highlighted tile to move.

Attack: When selected, click on a red-highlighted enemy unit to attack.

End Turn: Click the End Turn button located at the bottom right of the screen.

Development Information
This game is developed using HTML, CSS, and pure JavaScript, without any external libraries or frameworks.
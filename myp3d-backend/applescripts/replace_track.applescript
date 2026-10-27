on run argv
	set oldId to item 1 of argv
	set newId to item 2 of argv

	tell application "Music"
		set newMatches to (every track of library playlist 1 whose persistent ID is newId)
		if (count of newMatches) is 0 then error "Music lost the new copy of the song" number 1
		set newTrack to item 1 of newMatches
		set oldMatches to (every track of library playlist 1 whose persistent ID is oldId)
		if (count of oldMatches) is 0 then return
		set oldTrack to item 1 of oldMatches

		try
			set favorited of newTrack to favorited of oldTrack
		end try
		try
			set played count of newTrack to played count of oldTrack
		end try

		repeat with targetPlaylist in (every user playlist whose smart is false and special kind is none)
			try
				repeat with trackId in (persistent ID of every track of targetPlaylist)
					if contents of trackId is oldId then duplicate newTrack to targetPlaylist
				end repeat
			end try
		end repeat

		delete oldTrack
	end tell
end run

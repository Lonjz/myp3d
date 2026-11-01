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
				set trackIds to persistent ID of every track of targetPlaylist
				set oldIndex to my indexOf(oldId, trackIds)
				repeat while oldIndex > 0
					my keepPlace(targetPlaylist, trackIds, oldIndex, newTrack, newId)
					set trackIds to persistent ID of every track of targetPlaylist
					set oldIndex to my indexOf(oldId, trackIds)
				end repeat
			end try
		end repeat

		delete oldTrack
	end tell
end run

on indexOf(value, values)
	repeat with i from 1 to count of values
		if item i of values is value then return i
	end repeat
	return 0
end indexOf

on keepPlace(targetPlaylist, trackIds, oldIndex, newTrack, newId)
	tell application "Music"
		set trackCount to count of trackIds
		duplicate newTrack to targetPlaylist
		if persistent ID of track 1 of targetPlaylist is newId then
			repeat with i from (oldIndex + 1) to 2 by -1
				delete track i of targetPlaylist
			end repeat
			repeat with i from (oldIndex - 1) to 1 by -1
				duplicate (first track of library playlist 1 whose persistent ID is (item i of trackIds)) to targetPlaylist
			end repeat
		else if persistent ID of track (trackCount + 1) of targetPlaylist is newId then
			repeat with i from trackCount to oldIndex by -1
				delete track i of targetPlaylist
			end repeat
			repeat with i from (oldIndex + 1) to trackCount
				duplicate (first track of library playlist 1 whose persistent ID is (item i of trackIds)) to targetPlaylist
			end repeat
		else
			error "Music put the new copy somewhere unexpected" number 1
		end if
	end tell
end keepPlace

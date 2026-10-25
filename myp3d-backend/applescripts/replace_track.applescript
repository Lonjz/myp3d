on run argv
	set oldId to item 1 of argv
	set newId to item 2 of argv

	tell application "Music"
		set newMatches to (every track of library playlist 1 whose persistent ID is newId)
		if (count of newMatches) is 0 then error "Music lost the new copy of the song" number 1
		set newTrack to item 1 of newMatches
		set oldMatches to (every track of library playlist 1 whose persistent ID is oldId)
		if (count of oldMatches) is 0 then return ""
		set oldTrack to item 1 of oldMatches

		try
			set played count of newTrack to played count of oldTrack
		end try
		try
			set lastPlayed to played date of oldTrack
			if lastPlayed is not missing value then set played date of newTrack to lastPlayed
		end try
		try
			set skipped count of newTrack to skipped count of oldTrack
		end try
		try
			set lastSkipped to skipped date of oldTrack
			if lastSkipped is not missing value then set skipped date of newTrack to lastSkipped
		end try
		try
			if rating kind of oldTrack is user then set rating of newTrack to rating of oldTrack
		end try
		try
			set favorited of newTrack to favorited of oldTrack
		end try
		try
			set disliked of newTrack to disliked of oldTrack
		end try

		repeat with targetPlaylist in (every user playlist whose smart is false and special kind is none)
			try
				set trackIds to persistent ID of every track of targetPlaylist
				if trackIds contains oldId then my swapEntry(targetPlaylist, trackIds, oldId, newTrack)
			end try
		end repeat

		delete oldTrack
	end tell
	return ""
end run

on swapEntry(targetPlaylist, trackIds, oldId, newTrack)
	set total to count of trackIds
	set firstIndex to 0
	repeat with i from 1 to total
		if item i of trackIds is oldId then
			set firstIndex to i
			exit repeat
		end if
	end repeat
	if firstIndex is 0 then return

	tell application "Music"
		repeat with i from firstIndex to total
			if item i of trackIds is oldId then
				duplicate newTrack to targetPlaylist
			else
				duplicate track i of targetPlaylist to targetPlaylist
			end if
		end repeat
		repeat (total - firstIndex + 1) times
			delete track firstIndex of targetPlaylist
		end repeat
	end tell
end swapEntry

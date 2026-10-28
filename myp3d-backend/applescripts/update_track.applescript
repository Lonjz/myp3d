on run argv
	set trackId to item 1 of argv
	set newName to item 2 of argv
	set newArtist to item 3 of argv
	set newAlbum to item 4 of argv
	set artData to missing value
	if (count of argv) > 4 then set artData to read (POSIX file (item 5 of argv)) as JPEG picture

	tell application "Music"
		set matches to (every track of library playlist 1 whose persistent ID is trackId)
		if (count of matches) is 0 then error "That song is no longer in Apple Music" number 1
		set targetTrack to item 1 of matches
		if newName is not "" then set name of targetTrack to newName
		if newArtist is not "" then set artist of targetTrack to newArtist
		if newAlbum is not "" then set album of targetTrack to newAlbum
		if album artist of targetTrack is not "" then set album artist of targetTrack to ""
		if newArtist is not "" and newAlbum is "" then
			set currentAlbum to album of targetTrack
			set album of targetTrack to "myp3d " & currentAlbum
			set album of targetTrack to currentAlbum
		end if
		set artState to "noart"
		if artData is not missing value then
			set artState to my setArtwork(targetTrack, artData)
			if artState is not "art" then
				delay 1
				set artState to my setArtwork(targetTrack, artData)
			end if
		end if
		return artState
	end tell
end run

on setArtwork(targetTrack, artData)
	tell application "Music"
		try
			set data of artwork 1 of targetTrack to artData
		on error errMsg
			return "noart:" & errMsg
		end try
	end tell
	if hasReadableArtwork(targetTrack) then return "art"
	tell application "Music"
		return "noart:Music didn't keep the cover art"
	end tell
end setArtwork

on hasReadableArtwork(targetTrack)
	tell application "Music"
		try
			format of artwork 1 of targetTrack
			return true
		on error
			return false
		end try
	end tell
end hasReadableArtwork

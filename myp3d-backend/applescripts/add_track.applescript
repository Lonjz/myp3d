on run argv
	set fieldSep to character id 31
	set trackFile to POSIX file (item 1 of argv)
	set artData to missing value
	if (count of argv) > 1 then set artData to read (POSIX file (item 2 of argv)) as JPEG picture

	tell application "Music"
		set newTrack to add trackFile
		if newTrack is missing value then error "Music couldn't add the file" number 1
		if album artist of newTrack is not "" then set album artist of newTrack to ""
		set artState to "noart"
		if artData is not missing value then
			if my hasReadableArtwork(newTrack) then
				set artState to "art"
			else
				set artState to my setArtwork(newTrack, artData)
				if artState is not "art" then
					delay 1
					set artState to my setArtwork(newTrack, artData)
				end if
			end if
		end if
		return (persistent ID of newTrack) & fieldSep & artState
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

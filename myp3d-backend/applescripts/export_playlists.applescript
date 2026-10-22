on run
	set fieldSep to character id 31
	set recSep to character id 30
	set playlistsOut to {}

	tell application "Music"
		set candidates to (every user playlist whose smart is false and special kind is none)
		repeat with candidate in candidates
			set isGenius to false
			try
				set isGenius to genius of candidate
			end try
			if not isGenius then
				set playlistDescription to ""
				try
					set playlistDescription to description of candidate
					if playlistDescription is missing value then set playlistDescription to ""
				end try
				set fields to {persistent ID of candidate, name of candidate, playlistDescription} & (persistent ID of every track of candidate)
				set AppleScript's text item delimiters to fieldSep
				set end of playlistsOut to fields as text
				set AppleScript's text item delimiters to ""
			end if
		end repeat
	end tell

	set AppleScript's text item delimiters to recSep
	set playlistsText to playlistsOut as text
	set AppleScript's text item delimiters to ""
	return playlistsText
end run

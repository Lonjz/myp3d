on run
	set fieldSep to character id 31
	set missingIds to {}

	tell application "Music"
		repeat with candidate in (every file track of library playlist 1)
			try
				format of artwork 1 of candidate
			on error
				set end of missingIds to persistent ID of candidate
			end try
		end repeat
	end tell

	set AppleScript's text item delimiters to fieldSep
	set missingText to missingIds as text
	set AppleScript's text item delimiters to ""
	return missingText
end run

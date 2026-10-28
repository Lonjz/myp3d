on run argv
	set fieldSep to character id 31
	set missingIds to {}

	tell application "Music"
		repeat with i from 1 to count of argv
			set trackId to item i of argv
			set matches to (every track of library playlist 1 whose persistent ID is trackId)
			if (count of matches) is 0 then
				set end of missingIds to trackId
			else
				set album artist of (item 1 of matches) to ""
			end if
		end repeat
	end tell

	set AppleScript's text item delimiters to fieldSep
	set missingText to missingIds as text
	set AppleScript's text item delimiters to ""
	return missingText
end run

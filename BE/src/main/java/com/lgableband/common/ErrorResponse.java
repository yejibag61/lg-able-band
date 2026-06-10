package com.lgableband.common;

import java.util.Map;

public record ErrorResponse(
	String code,
	String message,
	Map<String, Object> details
) {
}

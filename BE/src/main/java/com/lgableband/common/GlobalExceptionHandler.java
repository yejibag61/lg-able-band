package com.lgableband.common;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
		return ResponseEntity.status(ex.getStatus())
			.body(new ErrorResponse(ex.getCode(), ex.getMessage(), Map.of()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST)
			.body(new ErrorResponse("INVALID_REQUEST", "요청값을 확인해주세요.", Map.of()));
	}

	@ExceptionHandler(MissingRequestHeaderException.class)
	public ResponseEntity<ErrorResponse> handleMissingRequestHeader(MissingRequestHeaderException ex) {
		if ("Authorization".equalsIgnoreCase(ex.getHeaderName())) {
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.body(new ErrorResponse("UNAUTHORIZED", "Authorization 헤더가 필요합니다.", Map.of()));
		}
		return ResponseEntity.status(HttpStatus.BAD_REQUEST)
			.body(new ErrorResponse("INVALID_REQUEST", "요청 헤더를 확인해주세요.", Map.of()));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleException(Exception ex) {
		log.error("Unhandled API exception", ex);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
			.body(new ErrorResponse("SERVER_ERROR", "서버 오류가 발생했습니다.", Map.of()));
	}
}

cmake_minimum_required(VERSION 3.13)

project(tree-sitter-logrotate
        VERSION "0.1.0"
        DESCRIPTION "Logrotate configuration grammar for Tree-sitter"
        HOMEPAGE_URL "https://github.com/willibrandon/tree-sitter-logrotate"
        LANGUAGES C)

option(BUILD_SHARED_LIBS "Build using shared libraries" ON)
option(TREE_SITTER_REUSE_ALLOCATOR "Reuse the library allocator" OFF)
option(TREE_SITTER_BUILD_JAVA_TEST_RUNTIME
       "Build the Tree-sitter runtime required by the Java binding tests" OFF)
option(TREE_SITTER_GENERATE_PARSER
       "Regenerate parser sources with the pinned Tree-sitter CLI" OFF)

set(TREE_SITTER_ABI_VERSION 15 CACHE STRING "Tree-sitter ABI version")
if(NOT ${TREE_SITTER_ABI_VERSION} MATCHES "^[0-9]+$")
    unset(TREE_SITTER_ABI_VERSION CACHE)
    message(FATAL_ERROR "TREE_SITTER_ABI_VERSION must be an integer")
endif()

include(GNUInstallDirs)
include(CTest)

if(TREE_SITTER_GENERATE_PARSER)
  find_program(NODE_EXECUTABLE node DOC "Node.js executable")
  if(NOT NODE_EXECUTABLE)
    message(FATAL_ERROR "Node.js is required; install the pinned version from toolchains.json")
  endif()

  set(TREE_SITTER_CLI_SCRIPT
      "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/tree-sitter-cli/cli.js"
      CACHE FILEPATH "Pinned Tree-sitter CLI JavaScript entry point")
  if(NOT EXISTS "${TREE_SITTER_CLI_SCRIPT}")
    message(FATAL_ERROR "Tree-sitter CLI is missing; run npm ci before configuring CMake")
  endif()
  set(TREE_SITTER_CLI_COMMAND "${NODE_EXECUTABLE}" "${TREE_SITTER_CLI_SCRIPT}")

  add_custom_command(OUTPUT "${CMAKE_CURRENT_SOURCE_DIR}/src/grammar.json"
                            "${CMAKE_CURRENT_SOURCE_DIR}/src/node-types.json"
                     DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/grammar.js"
                     COMMAND ${TREE_SITTER_CLI_COMMAND} generate grammar.js --no-parser
                     WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
                     COMMENT "Generating grammar.json")

  add_custom_command(OUTPUT "${CMAKE_CURRENT_SOURCE_DIR}/src/parser.c"
                     BYPRODUCTS "${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/parser.h"
                                "${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/alloc.h"
                                "${CMAKE_CURRENT_SOURCE_DIR}/src/tree_sitter/array.h"
                     DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/grammar.json"
                     COMMAND ${TREE_SITTER_CLI_COMMAND} generate src/grammar.json
                              --abi=${TREE_SITTER_ABI_VERSION}
                     WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
                     COMMENT "Generating parser.c")
  add_custom_target(generate-parser
                    DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/parser.c")
endif()

add_library(tree-sitter-logrotate src/parser.c)
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/src/scanner.c)
  target_sources(tree-sitter-logrotate PRIVATE src/scanner.c)
endif()
target_include_directories(tree-sitter-logrotate
                           PRIVATE src
                           INTERFACE $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/bindings/c>
                                     $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>)

target_compile_definitions(tree-sitter-logrotate PRIVATE
                           $<$<BOOL:${TREE_SITTER_REUSE_ALLOCATOR}>:TREE_SITTER_REUSE_ALLOCATOR>
                           $<$<CONFIG:Debug>:TREE_SITTER_DEBUG>)

set_target_properties(tree-sitter-logrotate
                      PROPERTIES
                      C_STANDARD 11
                      POSITION_INDEPENDENT_CODE ON
                      SOVERSION "${TREE_SITTER_ABI_VERSION}.${PROJECT_VERSION_MAJOR}"
                      WINDOWS_EXPORT_ALL_SYMBOLS ON
                      DEFINE_SYMBOL "")

if(TREE_SITTER_BUILD_JAVA_TEST_RUNTIME)
  set(TREE_SITTER_RUNTIME_ROOT
      "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/tree-sitter/vendor/tree-sitter/lib")
  if(NOT EXISTS "${TREE_SITTER_RUNTIME_ROOT}/src/lib.c")
    message(FATAL_ERROR
            "Tree-sitter runtime sources are missing; run npm ci before Maven")
  endif()

  add_library(tree-sitter-runtime SHARED "${TREE_SITTER_RUNTIME_ROOT}/src/lib.c")
  target_include_directories(tree-sitter-runtime
                             PRIVATE "${TREE_SITTER_RUNTIME_ROOT}/include"
                                     "${TREE_SITTER_RUNTIME_ROOT}/src")
  set_target_properties(tree-sitter-runtime
                        PROPERTIES
                        C_STANDARD 11
                        OUTPUT_NAME tree-sitter
                        POSITION_INDEPENDENT_CODE ON)
endif()

configure_file(bindings/c/tree-sitter-logrotate.pc.in
               "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-logrotate.pc" @ONLY)

install(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/bindings/c/tree_sitter"
        DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}"
        FILES_MATCHING PATTERN "*.h")
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-logrotate.pc"
        DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig")
install(TARGETS tree-sitter-logrotate
        ARCHIVE DESTINATION "${CMAKE_INSTALL_LIBDIR}"
        LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}"
        RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")

file(GLOB QUERIES queries/*.scm)
install(FILES ${QUERIES}
        DESTINATION "${CMAKE_INSTALL_DATADIR}/tree-sitter/queries/logrotate")

if(TREE_SITTER_GENERATE_PARSER)
  add_custom_target(ts-test ${TREE_SITTER_CLI_COMMAND} test
                    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
                    COMMENT "tree-sitter test")
endif()

if(BUILD_TESTING)
  set(TREE_SITTER_TEST_RUNTIME_ROOT
      "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/tree-sitter/vendor/tree-sitter/lib")
  if(NOT EXISTS "${TREE_SITTER_TEST_RUNTIME_ROOT}/src/lib.c")
    message(FATAL_ERROR
            "Tree-sitter runtime sources are missing; run npm ci before testing C")
  endif()
  add_library(tree-sitter-runtime-test STATIC
              "${TREE_SITTER_TEST_RUNTIME_ROOT}/src/lib.c")
  target_include_directories(tree-sitter-runtime-test
                             PUBLIC "${TREE_SITTER_TEST_RUNTIME_ROOT}/include"
                             PRIVATE "${TREE_SITTER_TEST_RUNTIME_ROOT}/src")
  set_target_properties(tree-sitter-runtime-test PROPERTIES C_STANDARD 11)

  add_executable(tree-sitter-logrotate-binding-test
                 test/c/binding-smoke.c)
  target_link_libraries(tree-sitter-logrotate-binding-test
                        PRIVATE tree-sitter-logrotate
                                tree-sitter-runtime-test)
  add_test(NAME c-binding-parses-logrotate
           COMMAND tree-sitter-logrotate-binding-test)
endif()
